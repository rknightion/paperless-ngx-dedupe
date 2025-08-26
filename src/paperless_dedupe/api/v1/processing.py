from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from paperless_dedupe.models.database import get_db, Document, DocumentContent
from paperless_dedupe.services.deduplication_service import DeduplicationService
from paperless_dedupe.core.config import settings
from pydantic import BaseModel
from typing import Optional
import logging
import asyncio
from datetime import datetime
from .websocket import broadcast_processing_update, broadcast_error, broadcast_completion

logger = logging.getLogger(__name__)
router = APIRouter()

# Global processing status
processing_status = {
    "is_processing": False,
    "current_step": "",
    "progress": 0,
    "total": 0,
    "started_at": None,
    "completed_at": None,
    "error": None
}

async def safe_broadcast_update():
    """Safely broadcast processing status update via WebSocket"""
    try:
        await broadcast_processing_update(processing_status.copy())
    except Exception as e:
        logger.error(f"Error broadcasting WebSocket update: {e}")

def update_status_and_broadcast(step: str, progress: Optional[int] = None):
    """Update processing status and broadcast via WebSocket"""
    global processing_status
    processing_status["current_step"] = step
    if progress is not None:
        processing_status["progress"] = progress
    
    # Schedule WebSocket broadcast in background
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(safe_broadcast_update())
    except RuntimeError:
        # Event loop not running, skip WebSocket broadcast
        pass

class AnalyzeRequest(BaseModel):
    threshold: Optional[float] = None
    force_rebuild: bool = False
    limit: Optional[int] = None

async def run_deduplication_analysis(
    db: Session,
    threshold: float,
    force_rebuild: bool,
    limit: Optional[int] = None
):
    """Background task to run deduplication analysis"""
    global processing_status
    
    try:
        processing_status["is_processing"] = True
        processing_status["current_step"] = "Loading documents"
        processing_status["started_at"] = datetime.utcnow()
        processing_status["error"] = None
        
        # Broadcast initial status
        await safe_broadcast_update()
        
        # Get documents to process
        query = db.query(Document)
        if not force_rebuild:
            query = query.filter(Document.processing_status == "pending")
        if limit:
            query = query.limit(limit)
        
        documents = query.all()
        processing_status["total"] = len(documents)
        
        # Broadcast document count
        await safe_broadcast_update()
        
        if not documents:
            processing_status["current_step"] = "No documents to process"
            await safe_broadcast_update()
            return
        
        logger.info(f"Processing {len(documents)} documents for deduplication")
        
        # Load OCR content
        processing_status["current_step"] = "Loading OCR content"
        contents = {}
        await safe_broadcast_update()
        
        for idx, doc in enumerate(documents):
            processing_status["progress"] = idx + 1
            
            # Broadcast progress every 10 documents or on last document
            if (idx + 1) % 10 == 0 or idx == len(documents) - 1:
                await safe_broadcast_update()
            
            # Get from database
            content = db.query(DocumentContent).filter(
                DocumentContent.document_id == doc.id
            ).first()
            
            if content and content.full_text:
                contents[doc.id] = content.full_text
            else:
                logger.warning(f"No OCR content for document {doc.id}")
        
        # Create progress callback for deduplication service
        async def dedup_progress_callback(step: str, current: int, total: int):
            processing_status["current_step"] = step
            processing_status["progress"] = current
            processing_status["total"] = total
            # Add estimated time remaining based on progress
            if current > 0 and processing_status.get("started_at"):
                elapsed = (datetime.utcnow() - processing_status["started_at"]).total_seconds()
                if elapsed > 0:
                    rate = current / elapsed
                    remaining = (total - current) / rate if rate > 0 else 0
                    processing_status["estimated_remaining"] = int(remaining)
            await safe_broadcast_update()
        
        # Run deduplication
        processing_status["current_step"] = "Initializing deduplication"
        processing_status["progress"] = 0
        await safe_broadcast_update()
        
        dedup_service = DeduplicationService()
        
        duplicate_groups = await dedup_service.find_duplicates(
            documents,
            contents,
            threshold,
            dedup_progress_callback
        )
        
        # Save results
        processing_status["current_step"] = "Saving results"
        await safe_broadcast_update()
        
        if duplicate_groups:
            dedup_service.save_duplicate_groups(db, duplicate_groups)
        
        # Update document processing status
        for doc in documents:
            doc.processing_status = "completed"
            doc.last_processed = datetime.utcnow()
        
        db.commit()
        
        
        processing_status["current_step"] = "Completed"
        processing_status["completed_at"] = datetime.utcnow()
        processing_status["progress"] = processing_status["total"]
        
        # Broadcast completion
        await safe_broadcast_update()
        
        # Send completion event with results
        try:
            await broadcast_completion({
                "groups_found": len(duplicate_groups),
                "documents_processed": len(documents),
                "completed_at": processing_status["completed_at"].isoformat() if processing_status["completed_at"] else None
            })
        except Exception as e:
            logger.error(f"Error broadcasting completion: {e}")
            
        logger.info(f"Deduplication analysis completed. Found {len(duplicate_groups)} duplicate groups")
        
    except Exception as e:
        logger.error(f"Error during deduplication analysis: {e}")
        processing_status["error"] = str(e)
        processing_status["current_step"] = "Error"
        
        # Broadcast error
        try:
            await safe_broadcast_update()
            await broadcast_error(f"Processing failed: {str(e)}")
        except Exception as broadcast_exc:
            logger.error(f"Error broadcasting error status: {broadcast_exc}")
    finally:
        processing_status["is_processing"] = False
        processing_status["progress"] = processing_status["total"]

@router.post("/analyze")
async def start_analysis(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start deduplication analysis"""
    global processing_status
    
    if processing_status["is_processing"]:
        raise HTTPException(status_code=409, detail="Analysis already in progress")
    
    # Check if there are documents to process
    document_count = db.query(Document).count()
    if document_count == 0:
        raise HTTPException(status_code=400, detail="No documents available. Please sync documents first.")
    
    threshold = request.threshold or (settings.fuzzy_match_threshold / 100.0)
    
    # Start background task
    background_tasks.add_task(
        run_deduplication_analysis,
        db,
        threshold,
        request.force_rebuild,
        request.limit
    )
    
    return {
        "status": "started",
        "message": "Deduplication analysis started",
        "document_count": document_count
    }

@router.get("/status")
async def get_processing_status():
    """Get current processing status"""
    # Convert datetime objects to ISO strings for JSON serialization
    status_copy = processing_status.copy()
    if status_copy.get("started_at") and isinstance(status_copy["started_at"], datetime):
        status_copy["started_at"] = status_copy["started_at"].isoformat()
    if status_copy.get("completed_at") and isinstance(status_copy["completed_at"], datetime):
        status_copy["completed_at"] = status_copy["completed_at"].isoformat()
    return status_copy

@router.post("/cancel")
async def cancel_processing():
    """Cancel current processing"""
    global processing_status
    
    if not processing_status["is_processing"]:
        raise HTTPException(status_code=400, detail="No processing in progress")
    
    processing_status["is_processing"] = False
    processing_status["current_step"] = "Cancelled"
    
    return {"status": "cancelled"}

@router.post("/clear-cache")
async def clear_cache():
    """Clear cache endpoint (deprecated - no longer using cache)"""
    return {"status": "success", "message": "Cache clearing not needed (Redis removed)"}