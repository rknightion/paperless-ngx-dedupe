import asyncio
import logging
import time
from datetime import datetime

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.core.task_status import (
    merge_processing_status,
    processing_status_snapshot,
    start_processing_status,
)
from paperless_dedupe.core.task_status import (
    processing_status_state as processing_status,
)
from paperless_dedupe.models.database import Document, DocumentContent, get_db
from paperless_dedupe.services.deduplication_service import DeduplicationService
from paperless_dedupe.worker.celery_app import app as celery_app

from .websocket import (
    broadcast_completion,
    broadcast_error,
    broadcast_processing_update,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def safe_broadcast_update():
    """Safely broadcast processing status update via WebSocket"""
    try:
        await broadcast_processing_update(processing_status_snapshot())
    except Exception as e:
        logger.error(f"Error broadcasting WebSocket update: {e}")


def update_status_and_broadcast(step: str, progress: int | None = None):
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
    threshold: float | None = None
    force_rebuild: bool = False
    limit: int | None = None


# DEPRECATED: Analysis now runs through Celery worker
# This function is kept for reference but should not be used
async def run_deduplication_analysis_deprecated(
    db: Session, threshold: float, force_rebuild: bool, limit: int | None = None
):
    """Background task to run deduplication analysis"""
    try:
        start_processing_status()
        processing_status["current_step"] = "Initializing analysis"
        processing_status["error"] = None
        processing_status["progress"] = 0
        processing_status["total"] = 0

        # Broadcast initial status immediately
        await safe_broadcast_update()

        # Small delay to ensure websocket message is sent
        await asyncio.sleep(0.1)

        # If force rebuild, clean up all existing duplicate groups first
        if force_rebuild:
            processing_status["current_step"] = "Clearing existing analysis data"
            await safe_broadcast_update()

            # Import required models
            from paperless_dedupe.models.database import DuplicateGroup, DuplicateMember

            # Delete all existing duplicate groups and members
            deleted_members = db.query(DuplicateMember).delete()
            deleted_groups = db.query(DuplicateGroup).delete()

            # Reset all documents to pending status
            db.query(Document).update(
                {"processing_status": "pending", "last_processed": None}
            )

            db.commit()
            logger.info(
                f"Cleared {deleted_groups} duplicate groups and {deleted_members} duplicate members for force rebuild"
            )

            # Small delay after cleanup
            await asyncio.sleep(0.1)

        # Now update to loading documents
        processing_status["current_step"] = "Loading documents"
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

        # Prepare document content for analysis
        processing_status["current_step"] = "Loading document content from database"
        processing_status["progress"] = 0
        processing_status["total"] = len(documents)
        contents = {}
        await safe_broadcast_update()

        # For large document sets, load in chunks to provide progress updates
        document_ids = [doc.id for doc in documents]
        chunk_size = 500  # Process 500 documents at a time

        for i in range(0, len(document_ids), chunk_size):
            chunk_ids = document_ids[i : i + chunk_size]

            # Update progress
            processing_status["progress"] = min(i + chunk_size, len(document_ids))
            processing_status["current_step"] = (
                f"Loading document content ({processing_status['progress']}/{len(documents)})"
            )
            await safe_broadcast_update()

            # Load this chunk
            ocr_chunk = (
                db.query(DocumentContent.document_id, DocumentContent.full_text)
                .filter(DocumentContent.document_id.in_(chunk_ids))
                .all()
            )

            # Add to contents dictionary
            for doc_id, full_text in ocr_chunk:
                if full_text:
                    contents[doc_id] = full_text

            # Yield control to prevent blocking
            await asyncio.sleep(0)

        docs_without_ocr = len(documents) - len(contents)
        if docs_without_ocr > 0:
            logger.warning(
                f"{docs_without_ocr} documents have no OCR content and will be skipped"
            )

        # Update status with actual document count that will be processed
        processing_status["total"] = len(contents)
        processing_status["current_step"] = (
            f"Preparing to analyze {len(contents)} documents"
        )
        processing_status["progress"] = 0
        await safe_broadcast_update()

        # Create progress callback for deduplication service
        last_dedup_broadcast = time.time()
        last_dedup_progress = 0

        async def dedup_progress_callback(step: str, current: int, total: int):
            nonlocal last_dedup_broadcast, last_dedup_progress
            processing_status["current_step"] = step
            processing_status["progress"] = current
            processing_status["total"] = total

            # Add estimated time remaining based on progress
            if current > 0 and processing_status.get("started_at"):
                elapsed = (
                    datetime.utcnow() - processing_status["started_at"]
                ).total_seconds()
                if elapsed > 0:
                    rate = current / elapsed
                    remaining = (total - current) / rate if rate > 0 else 0
                    processing_status["estimated_remaining"] = int(remaining)

            # Calculate progress percentage
            current_progress = int(current / total * 100) if total > 0 else 0
            current_time = time.time()

            # Broadcast if:
            # - 1 second has passed
            # - Progress increased by 2% or more (finer granularity for dedup)
            # - It's complete
            time_elapsed = current_time - last_dedup_broadcast >= 1
            progress_jump = current_progress - last_dedup_progress >= 2
            is_complete = current == total

            if time_elapsed or progress_jump or is_complete:
                await safe_broadcast_update()
                last_dedup_broadcast = current_time
                last_dedup_progress = current_progress

        # Run deduplication
        processing_status["current_step"] = "Initializing deduplication"
        processing_status["progress"] = 0
        await safe_broadcast_update()

        dedup_service = DeduplicationService()

        duplicate_groups = await dedup_service.find_duplicates(
            documents, contents, threshold, dedup_progress_callback
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

        # Set completion status
        processing_status["is_processing"] = False
        processing_status["current_step"] = "Completed"
        processing_status["completed_at"] = datetime.utcnow()
        processing_status["progress"] = processing_status["total"]

        # Broadcast completion status
        await safe_broadcast_update()

        # Small delay to ensure status update is sent before completion event
        await asyncio.sleep(0.1)

        # Send completion event with results
        try:
            await broadcast_completion(
                {
                    "groups_found": len(duplicate_groups),
                    "documents_processed": len(documents),
                    "completed_at": processing_status["completed_at"].isoformat()
                    if processing_status["completed_at"]
                    else None,
                }
            )
        except Exception as e:
            logger.error(f"Error broadcasting completion: {e}")

        logger.info(
            f"Deduplication analysis completed. Found {len(duplicate_groups)} duplicate groups"
        )

    except Exception as e:
        logger.error(f"Error during deduplication analysis: {e}")
        processing_status["error"] = str(e)
        processing_status["current_step"] = "Error"
        processing_status["is_processing"] = False

        # Broadcast error
        try:
            await safe_broadcast_update()
            await broadcast_error(f"Processing failed: {str(e)}")
        except Exception as broadcast_exc:
            logger.error(f"Error broadcasting error status: {broadcast_exc}")
    finally:
        # Only update if still processing (not already completed or errored)
        if processing_status["is_processing"]:
            processing_status["is_processing"] = False
            await safe_broadcast_update()


# DEPRECATED: Analysis now triggers through Celery worker
# Use the analyze_duplicates task directly instead
async def trigger_analysis_internal_deprecated(
    db: Session,
    force_rebuild: bool = False,
    threshold: float | None = None,
    limit: int | None = None,
):
    """DEPRECATED: Use Celery task instead"""
    logger.warning(
        "trigger_analysis_internal is deprecated. Use Celery worker tasks instead."
    )
    return False


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
                "current_step": "No task found or task waiting to start",
                "progress": 0,
                "total": 0,
            }
        elif task_result.state == "PROGRESS":
            return {
                "is_processing": True,
                "task_id": status_snapshot["task_id"],
                **task_result.info,
            }
        elif task_result.state == "SUCCESS":
            merge_processing_status(
                {"status": "completed", "task_id": status_snapshot["task_id"]}
            )
            return {
                "is_processing": False,
                "task_id": status_snapshot["task_id"],
                "status": "completed",
                **task_result.result,
            }
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


@router.post("/internal/broadcast-task-update")
async def broadcast_task_update(update: dict):
    """Internal endpoint for Celery workers to broadcast task updates via WebSocket"""
    try:
        await broadcast_processing_update(update)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error broadcasting task update: {e}")
        return {"status": "error", "message": str(e)}


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
