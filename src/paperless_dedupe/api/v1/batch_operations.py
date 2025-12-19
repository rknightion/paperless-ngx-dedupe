import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from paperless_dedupe.models.database import (
    Document,
    DuplicateGroup,
    get_db,
)
from paperless_dedupe.services.paperless_client import PaperlessClient

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
    document_ids: list[int] | None = Field(
        None, description="Document IDs to operate on"
    )
    group_ids: list[str] | None = Field(
        None, description="Duplicate group IDs to operate on"
    )
    parameters: dict[str, Any] | None = Field(
        default_factory=dict, description="Operation-specific parameters"
    )


class BatchOperationResponse(BaseModel):
    operation_id: str
    operation: OperationType
    status: OperationStatus
    message: str
    total_items: int
    processed_items: int = 0
    failed_items: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None


class BatchOperationProgress(BaseModel):
    operation_id: str
    status: OperationStatus
    progress_percentage: float
    current_item: int
    total_items: int
    message: str
    errors: list[str] = []
    results: dict[str, Any] | None = None


async def execute_batch_operation(
    operation_id: str,
    operation: OperationType,
    document_ids: list[int],
    parameters: dict[str, Any],
    db: Session,
):
    """Execute batch operation in background"""
    global batch_operations

    try:
        batch_operations[operation_id]["status"] = OperationStatus.IN_PROGRESS
        batch_operations[operation_id]["started_at"] = datetime.utcnow()

        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config

        client_settings = get_current_paperless_config(db)

        async with PaperlessClient(**client_settings) as client:
            total = len(document_ids)
            processed = 0
            failed = 0
            errors = []

            for idx, doc_id in enumerate(document_ids):
                try:
                    # Update progress
                    batch_operations[operation_id]["current_item"] = idx + 1
                    batch_operations[operation_id]["message"] = (
                        f"Processing document {doc_id} ({idx + 1}/{total})"
                    )

                    # Execute operation based on type
                    if operation == OperationType.MARK_FOR_DELETION:
                        # For now, we'll just track this in memory or skip it
                        # In production, you might want to track this differently
                        pass

                    elif operation == OperationType.DELETE:
                        # Delete from paperless if we have the paperless_id
                        document = (
                            db.query(Document).filter(Document.id == doc_id).first()
                        )
                        if document and document.paperless_id:
                            await client.delete_document(document.paperless_id)
                            # Also remove from our database
                            db.delete(document)
                            db.commit()

                    elif operation == OperationType.TAG:
                        # Add tags to document
                        tags = parameters.get("tags", [])
                        document = (
                            db.query(Document).filter(Document.id == doc_id).first()
                        )
                        if document and document.paperless_id:
                            await client.add_tags_to_document(
                                document.paperless_id, tags
                            )

                    elif operation == OperationType.UNTAG:
                        # Remove tags from document
                        tags = parameters.get("tags", [])
                        document = (
                            db.query(Document).filter(Document.id == doc_id).first()
                        )
                        if document and document.paperless_id:
                            await client.remove_tags_from_document(
                                document.paperless_id, tags
                            )

                    elif operation == OperationType.UPDATE_METADATA:
                        # Update document metadata
                        metadata = parameters.get("metadata", {})
                        document = (
                            db.query(Document).filter(Document.id == doc_id).first()
                        )
                        if document and document.paperless_id:
                            await client.update_document_metadata(
                                document.paperless_id, metadata
                            )
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
            batch_operations[operation_id]["status"] = (
                OperationStatus.PARTIALLY_COMPLETED
            )

        batch_operations[operation_id]["completed_at"] = datetime.utcnow()
        batch_operations[operation_id]["errors"] = errors
        batch_operations[operation_id]["message"] = (
            f"Processed {processed}/{total} documents, {failed} failed"
        )

    except Exception as e:
        logger.error(f"Batch operation {operation_id} failed: {e}")
        batch_operations[operation_id]["status"] = OperationStatus.FAILED
        batch_operations[operation_id]["message"] = str(e)
        batch_operations[operation_id]["completed_at"] = datetime.utcnow()


@router.post("/execute", response_model=BatchOperationResponse)
async def execute_batch_operation_endpoint(
    request: BatchOperationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
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
            group = (
                db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
            )
            if group:
                for member in group.members:
                    document_ids.append(member.document_id)

    if not document_ids:
        raise HTTPException(
            status_code=400, detail="No documents specified for operation"
        )

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
        "completed_at": None,
    }

    # Start background task
    background_tasks.add_task(
        execute_batch_operation,
        operation_id,
        request.operation,
        document_ids,
        request.parameters or {},
        db,
    )

    return BatchOperationResponse(
        operation_id=operation_id,
        operation=request.operation,
        status=OperationStatus.PENDING,
        message="Operation started in background",
        total_items=len(document_ids),
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
            "completed_at": op["completed_at"].isoformat()
            if op["completed_at"]
            else None,
        },
    )


@router.post("/documents/bulk-get")
async def bulk_get_documents(
    document_ids: list[int],
    include_content: bool = False,
    db: Session = Depends(get_db),
):
    """Bulk fetch multiple documents by IDs"""
    if not document_ids:
        raise HTTPException(status_code=400, detail="No document IDs provided")

    if len(document_ids) > 1000:
        raise HTTPException(
            status_code=400, detail="Maximum 1000 documents per request"
        )

    # Fetch documents in bulk
    documents = db.query(Document).filter(Document.id.in_(document_ids)).all()

    # Build response
    results = []
    for doc in documents:
        doc_data = {
            "id": doc.id,
            "paperless_id": doc.paperless_id,
            "title": doc.title,
            "fingerprint": doc.fingerprint,
            "created_date": doc.created_date,
            "processing_status": doc.processing_status,
            "correspondent": doc.correspondent,
            "document_type": doc.document_type,
            "tags": doc.tags,
            "has_duplicates": len(doc.duplicate_memberships) > 0,
        }

        if include_content and doc.content:
            doc_data["content"] = {
                "full_text": doc.content.full_text[:1000],  # Limit for bulk response
                "word_count": doc.content.word_count,
            }

        results.append(doc_data)

    return {"requested": len(document_ids), "found": len(results), "documents": results}


@router.post("/documents/bulk-metadata-update")
async def bulk_update_metadata(
    document_ids: list[int],
    updates: dict[str, Any],
    db: Session = Depends(get_db),
):
    """Bulk update metadata for multiple documents"""
    if not document_ids:
        raise HTTPException(status_code=400, detail="No document IDs provided")

    if len(document_ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 documents per request")

    # Validate update fields
    allowed_fields = {"correspondent", "document_type", "tags", "processing_status"}
    update_fields = {k: v for k, v in updates.items() if k in allowed_fields}

    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid update fields provided")

    # Perform bulk update in transaction
    try:
        updated_count = (
            db.query(Document)
            .filter(Document.id.in_(document_ids))
            .update(update_fields, synchronize_session=False)
        )

        db.commit()

        return {
            "status": "completed",
            "documents_updated": updated_count,
            "fields_updated": list(update_fields.keys()),
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error in bulk metadata update: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}") from e


@router.get("/operations", response_model=list[BatchOperationProgress])
async def list_operations(status: OperationStatus | None = None, limit: int = 100):
    """List recent batch operations"""

    operations = []

    for op_id, op in batch_operations.items():
        if status and op["status"] != status:
            continue

        progress = 0
        if op["total_items"] > 0:
            progress = (op["current_item"] / op["total_items"]) * 100

        operations.append(
            BatchOperationProgress(
                operation_id=op_id,
                status=op["status"],
                progress_percentage=progress,
                current_item=op["current_item"],
                total_items=op["total_items"],
                message=op["message"],
                errors=op.get("errors", [])[:5],  # Limit errors shown
                results={
                    "processed": op["processed_items"],
                    "failed": op["failed_items"],
                },
            )
        )

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
    group_ids: list[str],
    keep_primary: bool = True,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
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
            parameters={},
        )
        return await execute_batch_operation_endpoint(request, background_tasks, db)

    return {
        "status": "success",
        "message": f"Resolved {len(group_ids)} duplicate groups",
        "documents_marked": len(documents_to_delete),
    }


@router.post("/duplicates/bulk-review")
async def bulk_review_duplicates(
    group_ids: list[str], reviewed: bool = True, db: Session = Depends(get_db)
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
        "reviewed": reviewed,
    }
