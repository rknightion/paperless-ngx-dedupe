import logging
from datetime import datetime

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.core.task_status import (
    merge_processing_status,
    processing_history_snapshot,
    processing_status_snapshot,
    record_processing_history,
    start_processing_status,
)
from paperless_dedupe.core.task_status import (
    processing_status_state as processing_status,
)
from paperless_dedupe.models.database import Document, get_db
from paperless_dedupe.worker.celery_app import app as celery_app

from .websocket import broadcast_processing_update

logger = logging.getLogger(__name__)
router = APIRouter()


def _normalize_processing_payload(payload: dict) -> dict:
    """Normalize processing payload field names for client consumption."""
    if "duplicate_groups_found" in payload and "groups_found" not in payload:
        payload["groups_found"] = payload.get("duplicate_groups_found")
    if "documents_processed" in payload and "document_count" not in payload:
        payload["documents_processed"] = payload.get("documents_processed")
    return payload


class AnalyzeRequest(BaseModel):
    threshold: float | None = None
    force_rebuild: bool = False
    limit: int | None = None


class ProcessingHistoryEntry(BaseModel):
    id: str
    started_at: str | None = None
    completed_at: str | None = None
    status: str
    documents_processed: int = 0
    groups_found: int = 0
    error: str | None = None


class ProcessingHistoryResponse(BaseModel):
    runs: list[ProcessingHistoryEntry]


@router.post("/analyze")
async def start_analysis(
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
):
    """Start deduplication analysis using Celery task queue"""
    # Check if there's already an analysis in progress
    active_tasks = celery_app.control.inspect().active()
    if active_tasks:
        for _worker, tasks in active_tasks.items():
            for task in tasks:
                if "deduplication.analyze_duplicates" in task.get("name", ""):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Analysis already in progress (task: {task['id']})",
                    )

    # Check if sync is in progress by checking for active sync tasks
    if active_tasks:
        for _worker, tasks in active_tasks.items():
            for task in tasks:
                if "document_sync.sync_documents" in task.get("name", ""):
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot start analysis while document sync is in progress",
                    )

    # Check if there are documents to process
    document_count = db.query(Document).count()
    if document_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No documents available. Please sync documents first.",
        )

    threshold = request.threshold or (settings.fuzzy_match_threshold / 100.0)

    # Dispatch Celery task
    from paperless_dedupe.worker.tasks.deduplication import analyze_duplicates

    task = analyze_duplicates.apply_async(
        kwargs={
            "threshold": threshold,
            "force_rebuild": request.force_rebuild,
            "limit": request.limit,
            "broadcast_progress": True,
        },
        queue="deduplication",
    )

    # Store task ID in global status for compatibility
    start_processing_status(task_id=task.id)

    return {
        "status": "started",
        "message": "Deduplication analysis started",
        "task_id": task.id,
        "document_count": document_count,
    }


@router.get("/status")
async def get_processing_status():
    """Get current processing status from Celery task"""
    status_snapshot = processing_status_snapshot()

    # If there's a task ID, get status from Celery
    if status_snapshot.get("task_id"):
        task_result = AsyncResult(status_snapshot["task_id"], app=celery_app)

        if task_result.state == "PENDING":
            return {
                "is_processing": False,
                "task_id": status_snapshot["task_id"],
                "status": "pending",
                "current_step": "No task found or task waiting to start",
                "progress": 0,
                "total": 0,
            }
        elif task_result.state == "PROGRESS":
            payload = {
                "is_processing": True,
                "task_id": status_snapshot["task_id"],
                "status": "processing",
            }
            if isinstance(task_result.info, dict):
                payload.update(task_result.info)
            return _normalize_processing_payload(payload)
        elif task_result.state == "SUCCESS":
            merge_processing_status(
                {
                    "status": "completed",
                    "task_id": status_snapshot["task_id"],
                    "result": task_result.result
                    if isinstance(task_result.result, dict)
                    else None,
                    "completed_at": task_result.result.get("completed_at")
                    if isinstance(task_result.result, dict)
                    else None,
                }
            )
            payload = {
                "is_processing": False,
                "task_id": status_snapshot["task_id"],
                "status": "completed",
            }
            if isinstance(task_result.result, dict):
                payload.update(task_result.result)
            return _normalize_processing_payload(payload)
        elif task_result.state == "FAILURE":
            merge_processing_status(
                {
                    "status": "failed",
                    "task_id": status_snapshot["task_id"],
                    "error": str(task_result.info),
                }
            )
            return {
                "is_processing": False,
                "task_id": status_snapshot["task_id"],
                "status": "failed",
                "error": str(task_result.info),
            }

    # Fall back to global status if no task ID
    status_copy = processing_status_snapshot()
    if status_copy.get("started_at") and isinstance(
        status_copy["started_at"], datetime
    ):
        status_copy["started_at"] = status_copy["started_at"].isoformat()
    if status_copy.get("completed_at") and isinstance(
        status_copy["completed_at"], datetime
    ):
        status_copy["completed_at"] = status_copy["completed_at"].isoformat()
    if not status_copy.get("status"):
        status_copy["status"] = (
            "processing" if status_copy.get("is_processing") else "idle"
        )
    return _normalize_processing_payload(status_copy)


@router.post("/cancel")
async def cancel_processing():
    """Cancel current processing"""
    global processing_status

    if not processing_status["is_processing"]:
        raise HTTPException(status_code=400, detail="No processing in progress")

    processing_status["is_processing"] = False
    processing_status["current_step"] = "Cancelled"
    processing_status["status"] = "cancelled"
    processing_status["completed_at"] = datetime.utcnow().isoformat()

    record_processing_history(
        {
            "status": "cancelled",
            "task_id": processing_status.get("task_id"),
            "started_at": processing_status.get("started_at"),
            "completed_at": processing_status.get("completed_at"),
            "documents_processed": processing_status.get("documents_processed"),
            "duplicate_groups_found": processing_status.get("duplicate_groups_found"),
        }
    )

    return {"status": "cancelled"}


@router.post("/clear-cache")
async def clear_cache():
    """Clear cache endpoint (deprecated - no longer using cache)"""
    return {"status": "success", "message": "Cache clearing not needed (Redis removed)"}


@router.post("/internal/broadcast-task-update")
async def broadcast_task_update(update: dict):
    """Internal endpoint for Celery workers to broadcast task updates via WebSocket"""
    try:
        await broadcast_processing_update(update)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error broadcasting task update: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/history", response_model=ProcessingHistoryResponse)
async def get_processing_history():
    """Get processing history for recent runs"""
    return {"runs": processing_history_snapshot()}


@router.post("/cleanup-duplicates")
async def cleanup_duplicate_data(db: Session = Depends(get_db)):
    """Clean up all duplicate analysis data - useful for fixing corrupted state"""
    from paperless_dedupe.models.database import (
        Document,
        DuplicateGroup,
        DuplicateMember,
    )

    # Check if processing is running
    global processing_status
    if processing_status["is_processing"]:
        raise HTTPException(
            status_code=409, detail="Cannot clean up while analysis is in progress"
        )

    # Delete all duplicate groups and members
    deleted_members = db.query(DuplicateMember).delete()
    deleted_groups = db.query(DuplicateGroup).delete()

    # Reset all documents to pending status
    db.query(Document).update({"processing_status": "pending", "last_processed": None})

    db.commit()

    return {
        "status": "success",
        "deleted_groups": deleted_groups,
        "deleted_members": deleted_members,
        "message": f"Cleaned up {deleted_groups} duplicate groups and {deleted_members} member records",
    }
