from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from paperless_dedupe.models.database import get_db, Document, DocumentContent
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.services.cache_service import cache_service
from paperless_dedupe.core.config import settings
from pydantic import BaseModel
import logging
from datetime import datetime
from .websocket import broadcast_sync_update, broadcast_sync_completion, broadcast_error

logger = logging.getLogger(__name__)
router = APIRouter()

# Global sync status
sync_status = {
    "is_syncing": False,
    "current_step": "",
    "progress": 0,
    "total": 0,
    "started_at": None,
    "completed_at": None,
    "error": None,
    "documents_synced": 0,
    "documents_updated": 0
}

async def safe_broadcast_sync_update():
    """Safely broadcast sync status update via WebSocket"""
    try:
        await broadcast_sync_update(sync_status.copy())
    except Exception as e:
        logger.error(f"Error broadcasting sync WebSocket update: {e}")

class DocumentResponse(BaseModel):
    id: int
    paperless_id: int
    title: Optional[str]
    file_size: Optional[int]
    processing_status: str
    has_duplicates: bool = False
    created_date: Optional[datetime] = None
    last_processed: Optional[datetime] = None
    
    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

class DocumentListResponse(BaseModel):
    results: List[DocumentResponse]
    count: int
    next: Optional[str] = None
    previous: Optional[str] = None

class DocumentSync(BaseModel):
    force_refresh: bool = False
    limit: Optional[int] = None

@router.get("/", response_model=DocumentListResponse)
async def get_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get list of documents"""
    # Get total count
    total_count = db.query(Document).count()
    
    # Get paginated documents
    documents = db.query(Document).offset(skip).limit(limit).all()
    
    # Check if documents have duplicates
    results = []
    for doc in documents:
        doc_response = DocumentResponse.from_orm(doc)
        doc_response.has_duplicates = len(doc.duplicate_memberships) > 0
        results.append(doc_response)
    
    # Create pagination URLs (simplified for now)
    next_url = None
    previous_url = None
    if skip + limit < total_count:
        next_url = f"?skip={skip + limit}&limit={limit}"
    if skip > 0:
        previous_url = f"?skip={max(0, skip - limit)}&limit={limit}"
    
    return DocumentListResponse(
        results=results,
        count=total_count,
        next=next_url,
        previous=previous_url
    )

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get single document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc_response = DocumentResponse.from_orm(document)
    doc_response.has_duplicates = len(document.duplicate_memberships) > 0
    return doc_response

@router.get("/{document_id}/content")
async def get_document_content(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get document OCR content"""
    # Try cache first
    cached_content = await cache_service.get_document_ocr(document_id)
    if cached_content:
        return {"content": cached_content, "from_cache": True}
    
    # Get from database
    content = db.query(DocumentContent).filter(
        DocumentContent.document_id == document_id
    ).first()
    
    if not content:
        raise HTTPException(status_code=404, detail="Document content not found")
    
    # Cache for next time
    await cache_service.set_document_ocr(document_id, content.full_text)
    
    return {"content": content.full_text, "from_cache": False}

@router.get("/{document_id}/duplicates")
async def get_document_duplicates(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get duplicates for a specific document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    duplicates = []
    for membership in document.duplicate_memberships:
        group = membership.group
        for member in group.members:
            if member.document_id != document_id:
                duplicates.append({
                    "document_id": member.document.id,
                    "paperless_id": member.document.paperless_id,
                    "title": member.document.title,
                    "confidence": group.confidence_score,
                    "group_id": group.id
                })
    
    return {"document_id": document_id, "duplicates": duplicates}

async def run_document_sync(
    db: Session,
    force_refresh: bool = False,
    limit: Optional[int] = None
):
    """Background task to sync documents from paperless-ngx"""
    global sync_status
    
    try:
        sync_status["is_syncing"] = True
        sync_status["current_step"] = "Connecting to Paperless"
        sync_status["started_at"] = datetime.utcnow()
        sync_status["error"] = None
        sync_status["documents_synced"] = 0
        sync_status["documents_updated"] = 0
        
        await safe_broadcast_sync_update()
        
        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config
        client_settings = get_current_paperless_config(db)
        
        async with PaperlessClient(**client_settings) as client:
            # Test connection first
            if not await client.test_connection():
                raise Exception("Cannot connect to paperless-ngx API")
            
            # Get all documents from paperless
            sync_status["current_step"] = "Fetching document list"
            await safe_broadcast_sync_update()
            
            logger.info("Starting document sync from paperless-ngx")
            paperless_docs = await client.get_all_documents()
            
            if limit:
                paperless_docs = paperless_docs[:limit]
            
            sync_status["total"] = len(paperless_docs)
            sync_status["current_step"] = f"Syncing {len(paperless_docs)} documents"
            await safe_broadcast_sync_update()
            
            # Sync to database
            synced_count = 0
            updated_count = 0
            
            for idx, pdoc in enumerate(paperless_docs):
                sync_status["progress"] = idx + 1
                
                # Broadcast progress every 10 documents or on last
                if (idx + 1) % 10 == 0 or idx == len(paperless_docs) - 1:
                    await safe_broadcast_sync_update()
                
                # Check if document exists
                existing = db.query(Document).filter(
                    Document.paperless_id == pdoc["id"]
                ).first()
                
                if existing and not force_refresh:
                    # Skip if document exists and we're not forcing refresh
                    updated_count += 1
                    continue
                
                # Process tags - they might be IDs or objects
                tags_list = []
                tags_data = pdoc.get("tags", [])
                if tags_data:
                    for tag in tags_data:
                        if isinstance(tag, dict):
                            # Tag is an object with name
                            tags_list.append(tag.get("name", str(tag.get("id", ""))))
                        else:
                            # Tag is just an ID, we'll store the ID as string
                            tags_list.append(f"tag-{tag}")
                
                if existing:
                    # Update existing document
                    existing.title = pdoc.get("title", "")
                    existing.file_size = pdoc.get("original_file_size")
                    existing.created_date = pdoc.get("created")
                    existing.correspondent = pdoc.get("correspondent_name")
                    existing.document_type = pdoc.get("document_type_name")
                    existing.tags = tags_list
                    existing.archive_filename = pdoc.get("archive_filename")
                    existing.original_filename = pdoc.get("original_filename")
                    existing.added_date = pdoc.get("added")
                    existing.modified_date = pdoc.get("modified")
                    updated_count += 1
                else:
                    # Create new document
                    document = Document(
                        paperless_id=pdoc["id"],
                        title=pdoc.get("title", ""),
                        file_size=pdoc.get("original_file_size"),
                        created_date=pdoc.get("created"),
                        correspondent=pdoc.get("correspondent_name"),
                        document_type=pdoc.get("document_type_name"),
                        tags=tags_list,
                        archive_filename=pdoc.get("archive_filename"),
                        original_filename=pdoc.get("original_filename"),
                        added_date=pdoc.get("added"),
                        modified_date=pdoc.get("modified"),
                        processing_status="pending"
                    )
                    db.add(document)
                    db.flush()  # Get the ID for the document
                    synced_count += 1
                
                # Get and store OCR content
                content_text = pdoc.get("content", "")
                if content_text:
                    # Remove existing content if updating
                    if existing:
                        db.query(DocumentContent).filter(
                            DocumentContent.document_id == existing.id
                        ).delete()
                    
                    # Add new content
                    content = DocumentContent(
                        document_id=document.id if not existing else existing.id,
                        full_text=content_text[:settings.max_ocr_length] if len(content_text) > settings.max_ocr_length else content_text,
                        word_count=len(content_text.split())
                    )
                    db.add(content)
                    
                    # Cache OCR content
                    doc_id = document.id if not existing else existing.id
                    await cache_service.set_document_ocr(doc_id, content.full_text)
                
                # Commit in batches to avoid holding transaction too long
                if (idx + 1) % 100 == 0:
                    db.commit()
            
            # Final commit
            db.commit()
            
            sync_status["documents_synced"] = synced_count
            sync_status["documents_updated"] = updated_count
            sync_status["current_step"] = "Completed"
            sync_status["completed_at"] = datetime.utcnow()
            sync_status["progress"] = sync_status["total"]
            
            await safe_broadcast_sync_update()
            
            # Broadcast completion
            try:
                await broadcast_sync_completion({
                    "total_documents": len(paperless_docs),
                    "new_documents": synced_count,
                    "updated_documents": updated_count,
                    "completed_at": sync_status["completed_at"].isoformat()
                })
            except Exception as e:
                logger.error(f"Error broadcasting sync completion: {e}")
                
            logger.info(f"Document sync completed. Synced: {synced_count}, Updated: {updated_count}")
            
    except Exception as e:
        logger.error(f"Error during document sync: {e}")
        sync_status["error"] = str(e)
        sync_status["current_step"] = "Error"
        
        try:
            await safe_broadcast_sync_update()
            await broadcast_error(f"Sync failed: {str(e)}")
        except Exception as broadcast_exc:
            logger.error(f"Error broadcasting sync error: {broadcast_exc}")
    finally:
        sync_status["is_syncing"] = False

@router.post("/sync")
async def sync_documents(
    sync_config: DocumentSync,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Sync documents from paperless-ngx"""
    global sync_status
    
    if sync_status["is_syncing"]:
        raise HTTPException(status_code=409, detail="Sync already in progress")
    
    # Start background task
    background_tasks.add_task(
        run_document_sync,
        db,
        sync_config.force_refresh,
        sync_config.limit
    )
    
    return {
        "status": "started",
        "message": "Document sync started in background"
    }

@router.get("/sync/status")
async def get_sync_status(db: Session = Depends(get_db)):
    """Get current sync status"""
    # Convert datetime objects to ISO strings for JSON serialization
    status_copy = sync_status.copy()
    
    # If no sync is in progress and completed_at is None, check if we have documents
    # This handles the case where the app has restarted and lost in-memory status
    if not status_copy["is_syncing"] and status_copy["completed_at"] is None:
        document_count = db.query(Document).count()
        if document_count > 0:
            # We have documents, so a sync must have happened previously
            # Get the most recent document's last_processed timestamp
            most_recent = db.query(Document).order_by(Document.last_processed.desc()).first()
            if most_recent and most_recent.last_processed:
                status_copy["completed_at"] = most_recent.last_processed
                status_copy["documents_synced"] = document_count
    
    if status_copy.get("started_at") and isinstance(status_copy["started_at"], datetime):
        status_copy["started_at"] = status_copy["started_at"].isoformat()
    if status_copy.get("completed_at") and isinstance(status_copy["completed_at"], datetime):
        status_copy["completed_at"] = status_copy["completed_at"].isoformat()
    return status_copy

@router.get("/statistics")
async def get_document_statistics(db: Session = Depends(get_db)):
    """Get comprehensive document statistics"""
    from sqlalchemy import func
    
    # Get basic counts
    total_documents = db.query(Document).count()
    
    # Get processing status counts
    processing_status = {
        "pending": db.query(Document).filter(Document.processing_status == "pending").count(),
        "processing": db.query(Document).filter(Document.processing_status == "processing").count(),
        "completed": db.query(Document).filter(Document.processing_status == "completed").count(),
        "error": db.query(Document).filter(Document.processing_status == "error").count(),
    }
    
    # Get OCR statistics
    documents_with_ocr = db.query(Document).join(DocumentContent).filter(
        DocumentContent.ocr_text.isnot(None),
        func.length(DocumentContent.ocr_text) > 0
    ).count()
    
    documents_without_ocr = total_documents - documents_with_ocr
    
    # Calculate average OCR length
    avg_ocr_length = db.query(func.avg(func.length(DocumentContent.ocr_text))).scalar() or 0
    
    # Get total size (if stored)
    total_size = db.query(func.sum(Document.file_size)).scalar() or 0
    
    # Size distribution (simplified since file_size might not be populated)
    small_docs = db.query(Document).filter(Document.file_size < 100 * 1024).count() if total_size > 0 else 0
    medium_docs = db.query(Document).filter(Document.file_size >= 100 * 1024, Document.file_size < 1024 * 1024).count() if total_size > 0 else 0
    large_docs = db.query(Document).filter(Document.file_size >= 1024 * 1024, Document.file_size < 10 * 1024 * 1024).count() if total_size > 0 else 0
    xlarge_docs = db.query(Document).filter(Document.file_size >= 10 * 1024 * 1024).count() if total_size > 0 else 0
    
    size_distribution = {
        "small": small_docs,
        "medium": medium_docs,
        "large": large_docs,
        "xlarge": xlarge_docs,
    }
    
    # Sync status
    last_sync = db.query(func.max(Document.created_at)).scalar()
    
    return {
        "total_documents": total_documents,
        "total_size": total_size,
        "processed_count": processing_status["completed"],
        "pending_count": processing_status["pending"],
        "error_count": processing_status["error"],
        "average_ocr_length": int(avg_ocr_length),
        "documents_with_ocr": documents_with_ocr,
        "documents_without_ocr": documents_without_ocr,
        "size_distribution": size_distribution,
        "processing_status": processing_status,
        "sync_status": {
            "last_sync": last_sync.isoformat() if last_sync else None,
            "documents_synced": total_documents,
            "sync_in_progress": sync_status.get("is_syncing", False)
        }
    }