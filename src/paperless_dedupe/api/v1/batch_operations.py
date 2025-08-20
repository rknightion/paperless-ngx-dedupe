from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from paperless_dedupe.models.database import get_db, Document, DuplicateGroup
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.core.config import settings
from pydantic import BaseModel, Field
import logging
import asyncio
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)
router = APIRouter()

# Global operation status tracking
batch_operations = {}

class OperationType(str, Enum):
    MARK_FOR_DELETION = "mark_for_deletion"
    DELETE = "delete"
    TAG = "tag"
    UNTAG = "untag"
    UPDATE_METADATA = "update_metadata"
    MERGE_DOCUMENTS = "merge_documents"
    MARK_REVIEWED = "mark_reviewed"
    RESOLVE_DUPLICATES = "resolve_duplicates"

class OperationStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"

class BatchOperationRequest(BaseModel):
    operation: OperationType
    document_ids: Optional[List[int]] = Field(None, description="Document IDs to operate on")
    group_ids: Optional[List[str]] = Field(None, description="Duplicate group IDs to operate on")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Operation-specific parameters")
    
class BatchOperationResponse(BaseModel):
    operation_id: str
    operation: OperationType
    status: OperationStatus
    message: str
    total_items: int
    processed_items: int = 0
    failed_items: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
class BatchOperationProgress(BaseModel):
    operation_id: str
    status: OperationStatus
    progress_percentage: float
    current_item: int
    total_items: int
    message: str
    errors: List[str] = []
    results: Optional[Dict[str, Any]] = None

async def execute_batch_operation(
    operation_id: str,
    operation: OperationType,
    document_ids: List[int],
    parameters: Dict[str, Any],
    db: Session
):
    """Execute batch operation in background"""
    global batch_operations
    
    try:
        batch_operations[operation_id]["status"] = OperationStatus.IN_PROGRESS
        batch_operations[operation_id]["started_at"] = datetime.utcnow()
        
        client = PaperlessClient(
            base_url=settings.paperless_url,
            api_token=settings.paperless_api_token,
            username=settings.paperless_username,
            password=settings.paperless_password
        )
        
        total = len(document_ids)
        processed = 0
        failed = 0
        errors = []
        
        for idx, doc_id in enumerate(document_ids):
            try:
                # Update progress
                batch_operations[operation_id]["current_item"] = idx + 1
                batch_operations[operation_id]["message"] = f"Processing document {doc_id} ({idx + 1}/{total})"
                
                # Execute operation based on type
                if operation == OperationType.MARK_FOR_DELETION:
                    # Mark document for deletion in our database
                    document = db.query(Document).filter(Document.id == doc_id).first()
                    if document:
                        document.marked_for_deletion = True
                        db.commit()
                        
                elif operation == OperationType.DELETE:
                    # Delete from paperless if we have the paperless_id
                    document = db.query(Document).filter(Document.id == doc_id).first()
                    if document and document.paperless_id:
                        await client.delete_document(document.paperless_id)
                        # Also remove from our database
                        db.delete(document)
                        db.commit()
                        
                elif operation == OperationType.TAG:
                    # Add tags to document
                    tags = parameters.get("tags", [])
                    document = db.query(Document).filter(Document.id == doc_id).first()
                    if document and document.paperless_id:
                        await client.add_tags_to_document(document.paperless_id, tags)
                        
                elif operation == OperationType.UNTAG:
                    # Remove tags from document
                    tags = parameters.get("tags", [])
                    document = db.query(Document).filter(Document.id == doc_id).first()
                    if document and document.paperless_id:
                        await client.remove_tags_from_document(document.paperless_id, tags)
                        
                elif operation == OperationType.UPDATE_METADATA:
                    # Update document metadata
                    metadata = parameters.get("metadata", {})
                    document = db.query(Document).filter(Document.id == doc_id).first()
                    if document and document.paperless_id:
                        await client.update_document_metadata(document.paperless_id, metadata)
                        # Update local record
                        for key, value in metadata.items():
                            if hasattr(document, key):
                                setattr(document, key, value)
                        db.commit()
                
                processed += 1
                batch_operations[operation_id]["processed_items"] = processed
                
            except Exception as e:
                logger.error(f"Failed to process document {doc_id}: {e}")
                failed += 1
                batch_operations[operation_id]["failed_items"] = failed
                errors.append(f"Document {doc_id}: {str(e)}")
                
            # Yield control periodically
            if idx % 10 == 0:
                await asyncio.sleep(0.1)
        
        # Update final status
        if failed == 0:
            batch_operations[operation_id]["status"] = OperationStatus.COMPLETED
        elif failed == total:
            batch_operations[operation_id]["status"] = OperationStatus.FAILED
        else:
            batch_operations[operation_id]["status"] = OperationStatus.PARTIALLY_COMPLETED
            
        batch_operations[operation_id]["completed_at"] = datetime.utcnow()
        batch_operations[operation_id]["errors"] = errors
        batch_operations[operation_id]["message"] = f"Processed {processed}/{total} documents, {failed} failed"
        
    except Exception as e:
        logger.error(f"Batch operation {operation_id} failed: {e}")
        batch_operations[operation_id]["status"] = OperationStatus.FAILED
        batch_operations[operation_id]["message"] = str(e)
        batch_operations[operation_id]["completed_at"] = datetime.utcnow()

@router.post("/execute", response_model=BatchOperationResponse)
async def execute_batch_operation_endpoint(
    request: BatchOperationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Execute a batch operation on multiple documents or duplicate groups"""
    
    # Generate operation ID
    operation_id = f"batch_{request.operation}_{datetime.utcnow().timestamp()}"
    
    # Determine target documents
    document_ids = []
    
    if request.document_ids:
        document_ids = request.document_ids
    elif request.group_ids:
        # Get all documents from specified duplicate groups
        for group_id in request.group_ids:
            group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
            if group:
                for member in group.members:
                    document_ids.append(member.document_id)
    
    if not document_ids:
        raise HTTPException(status_code=400, detail="No documents specified for operation")
    
    # Initialize operation tracking
    batch_operations[operation_id] = {
        "operation_id": operation_id,
        "operation": request.operation,
        "status": OperationStatus.PENDING,
        "total_items": len(document_ids),
        "processed_items": 0,
        "failed_items": 0,
        "current_item": 0,
        "message": "Operation queued",
        "errors": [],
        "started_at": None,
        "completed_at": None
    }
    
    # Start background task
    background_tasks.add_task(
        execute_batch_operation,
        operation_id,
        request.operation,
        document_ids,
        request.parameters or {},
        db
    )
    
    return BatchOperationResponse(
        operation_id=operation_id,
        operation=request.operation,
        status=OperationStatus.PENDING,
        message="Operation started in background",
        total_items=len(document_ids)
    )

@router.get("/status/{operation_id}", response_model=BatchOperationProgress)
async def get_operation_status(operation_id: str):
    """Get status of a batch operation"""
    
    if operation_id not in batch_operations:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    op = batch_operations[operation_id]
    
    # Calculate progress percentage
    progress = 0
    if op["total_items"] > 0:
        progress = (op["current_item"] / op["total_items"]) * 100
    
    return BatchOperationProgress(
        operation_id=operation_id,
        status=op["status"],
        progress_percentage=progress,
        current_item=op["current_item"],
        total_items=op["total_items"],
        message=op["message"],
        errors=op.get("errors", []),
        results={
            "processed": op["processed_items"],
            "failed": op["failed_items"],
            "started_at": op["started_at"].isoformat() if op["started_at"] else None,
            "completed_at": op["completed_at"].isoformat() if op["completed_at"] else None
        }
    )

@router.get("/operations", response_model=List[BatchOperationProgress])
async def list_operations(
    status: Optional[OperationStatus] = None,
    limit: int = 10
):
    """List recent batch operations"""
    
    operations = []
    
    for op_id, op in batch_operations.items():
        if status and op["status"] != status:
            continue
            
        progress = 0
        if op["total_items"] > 0:
            progress = (op["current_item"] / op["total_items"]) * 100
            
        operations.append(BatchOperationProgress(
            operation_id=op_id,
            status=op["status"],
            progress_percentage=progress,
            current_item=op["current_item"],
            total_items=op["total_items"],
            message=op["message"],
            errors=op.get("errors", [])[:5],  # Limit errors shown
            results={
                "processed": op["processed_items"],
                "failed": op["failed_items"]
            }
        ))
    
    # Sort by most recent first and limit
    operations.sort(key=lambda x: x.operation_id, reverse=True)
    return operations[:limit]

@router.delete("/cancel/{operation_id}")
async def cancel_operation(operation_id: str):
    """Cancel a pending or in-progress batch operation"""
    
    if operation_id not in batch_operations:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    op = batch_operations[operation_id]
    
    if op["status"] in [OperationStatus.COMPLETED, OperationStatus.FAILED]:
        raise HTTPException(status_code=400, detail="Cannot cancel completed operation")
    
    # Mark as cancelled (would need to implement actual cancellation logic)
    op["status"] = OperationStatus.FAILED
    op["message"] = "Operation cancelled by user"
    op["completed_at"] = datetime.utcnow()
    
    return {"status": "cancelled", "operation_id": operation_id}

@router.post("/duplicates/bulk-resolve")
async def bulk_resolve_duplicates(
    group_ids: List[str],
    keep_primary: bool = True,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Bulk resolve duplicate groups by keeping primary document and deleting others"""
    
    documents_to_delete = []
    
    for group_id in group_ids:
        group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
        if not group:
            continue
            
        # Mark group as resolved
        group.resolved = True
        group.reviewed = True
        
        # Collect documents to delete (all except primary if keep_primary is True)
        for member in group.members:
            if keep_primary and member.is_primary:
                continue
            documents_to_delete.append(member.document_id)
    
    db.commit()
    
    # Create batch operation for deletion
    if documents_to_delete:
        request = BatchOperationRequest(
            operation=OperationType.DELETE,
            document_ids=documents_to_delete,
            parameters={}
        )
        return await execute_batch_operation_endpoint(request, background_tasks, db)
    
    return {
        "status": "success",
        "message": f"Resolved {len(group_ids)} duplicate groups",
        "documents_marked": len(documents_to_delete)
    }

@router.post("/duplicates/bulk-review")
async def bulk_review_duplicates(
    group_ids: List[str],
    reviewed: bool = True,
    db: Session = Depends(get_db)
):
    """Bulk mark duplicate groups as reviewed/unreviewed"""
    
    updated_count = 0
    
    for group_id in group_ids:
        group = db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
        if group:
            group.reviewed = reviewed
            updated_count += 1
    
    db.commit()
    
    return {
        "status": "success",
        "message": f"Updated review status for {updated_count} groups",
        "reviewed": reviewed
    }