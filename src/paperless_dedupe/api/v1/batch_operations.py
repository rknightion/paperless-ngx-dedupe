import logging
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from paperless_dedupe.models.database import (
    BatchOperation,
    Document,
    DuplicateGroup,
    get_db,
)
from paperless_dedupe.worker.celery_app import app as celery_app

logger = logging.getLogger(__name__)
router = APIRouter()


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


def _coerce_group_ids(group_ids: list[str] | None) -> list[int]:
    if not group_ids:
        return []
    coerced = []
    for group_id in group_ids:
        try:
            coerced.append(int(group_id))
        except (TypeError, ValueError):
            continue
    return coerced


def _enqueue_batch_operation(
    db: Session,
    operation: OperationType,
    document_ids: list[int] | None,
    group_ids: list[int] | None,
    parameters: dict[str, Any] | None,
) -> BatchOperation:
    from paperless_dedupe.worker.tasks.batch_operations import run_batch_operation

    operation_id = f"batch_{operation.value}_{uuid4().hex}"
    total_items = len(group_ids or document_ids or [])

    op_record = BatchOperation(
        id=operation_id,
        operation=operation.value,
        status=OperationStatus.PENDING.value,
        message="Operation queued",
        total_items=total_items,
        processed_items=0,
        failed_items=0,
        current_item=0,
        parameters=parameters or {},
        errors=[],
        created_at=datetime.utcnow(),
    )
    db.add(op_record)
    db.commit()

    task = run_batch_operation.apply_async(
        kwargs={
            "operation_id": operation_id,
            "operation": operation.value,
            "document_ids": document_ids or [],
            "group_ids": group_ids or [],
            "parameters": parameters or {},
            "broadcast_progress": True,
        },
        queue="default",
    )
    op_record.task_id = task.id
    db.commit()
    return op_record


@router.post("/execute", response_model=BatchOperationResponse)
async def execute_batch_operation_endpoint(
    request: BatchOperationRequest,
    db: Session = Depends(get_db),
):
    """Execute a batch operation on multiple documents or duplicate groups"""
    document_ids: list[int] = []
    group_ids = _coerce_group_ids(request.group_ids)

    if request.document_ids:
        document_ids = request.document_ids
    elif group_ids and request.operation not in {
        OperationType.MARK_REVIEWED,
        OperationType.RESOLVE_DUPLICATES,
    }:
        for group_id in group_ids:
            group = (
                db.query(DuplicateGroup).filter(DuplicateGroup.id == group_id).first()
            )
            if group:
                for member in group.members:
                    document_ids.append(member.document_id)
        group_ids = []

    if not document_ids and not group_ids:
        raise HTTPException(
            status_code=400, detail="No documents or groups specified for operation"
        )

    op_record = _enqueue_batch_operation(
        db,
        request.operation,
        document_ids=document_ids,
        group_ids=group_ids,
        parameters=request.parameters or {},
    )

    return BatchOperationResponse(
        operation_id=op_record.id,
        operation=request.operation,
        status=OperationStatus.PENDING,
        message="Operation queued",
        total_items=op_record.total_items,
    )


@router.get("/status/{operation_id}", response_model=BatchOperationProgress)
async def get_operation_status(operation_id: str, db: Session = Depends(get_db)):
    """Get status of a batch operation"""
    op = db.query(BatchOperation).filter(BatchOperation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operation not found")

    progress = 0.0
    if op.total_items > 0:
        progress = (op.current_item / op.total_items) * 100

    return BatchOperationProgress(
        operation_id=operation_id,
        status=OperationStatus(op.status),
        progress_percentage=progress,
        current_item=op.current_item,
        total_items=op.total_items,
        message=op.message or "",
        errors=op.errors or [],
        results={
            "processed": op.processed_items,
            "failed": op.failed_items,
            "started_at": op.started_at.isoformat() if op.started_at else None,
            "completed_at": op.completed_at.isoformat() if op.completed_at else None,
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
async def list_operations(
    status: OperationStatus | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List recent batch operations"""
    query = db.query(BatchOperation)
    if status:
        query = query.filter(BatchOperation.status == status.value)

    ops = query.order_by(BatchOperation.created_at.desc()).limit(limit).all()

    operations = []
    for op in ops:
        progress = 0.0
        if op.total_items > 0:
            progress = (op.current_item / op.total_items) * 100

        operations.append(
            BatchOperationProgress(
                operation_id=op.id,
                status=OperationStatus(op.status),
                progress_percentage=progress,
                current_item=op.current_item,
                total_items=op.total_items,
                message=op.message or "",
                errors=(op.errors or [])[:5],
                results={
                    "processed": op.processed_items,
                    "failed": op.failed_items,
                },
            )
        )

    return operations


@router.delete("/cancel/{operation_id}")
async def cancel_operation(operation_id: str, db: Session = Depends(get_db)):
    """Cancel a pending or in-progress batch operation"""
    op = db.query(BatchOperation).filter(BatchOperation.id == operation_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operation not found")

    if op.status in [OperationStatus.COMPLETED.value, OperationStatus.FAILED.value]:
        raise HTTPException(status_code=400, detail="Cannot cancel completed operation")

    if op.task_id:
        celery_app.control.revoke(op.task_id, terminate=False)

    op.status = OperationStatus.FAILED.value
    op.message = "Operation cancelled by user"
    op.completed_at = datetime.utcnow()
    db.commit()

    return {"status": "cancelled", "operation_id": operation_id}


@router.post("/duplicates/bulk-resolve")
async def bulk_resolve_duplicates(
    group_ids: list[str],
    keep_primary: bool = True,
    db: Session = Depends(get_db),
):
    """Bulk resolve duplicate groups by keeping primary document and deleting others"""
    request = BatchOperationRequest(
        operation=OperationType.RESOLVE_DUPLICATES,
        group_ids=group_ids,
        parameters={"keep_primary": keep_primary},
    )
    return await execute_batch_operation_endpoint(request, db)


@router.post("/duplicates/bulk-review")
async def bulk_review_duplicates(
    group_ids: list[str], reviewed: bool = True, db: Session = Depends(get_db)
):
    """Bulk mark duplicate groups as reviewed/unreviewed"""
    request = BatchOperationRequest(
        operation=OperationType.MARK_REVIEWED,
        group_ids=group_ids,
        parameters={"reviewed": reviewed},
    )
    return await execute_batch_operation_endpoint(request, db)
