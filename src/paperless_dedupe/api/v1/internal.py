"""Internal API endpoints for worker communication"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from paperless_dedupe.api.v1.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter()


class TaskUpdate(BaseModel):
    """Task update payload from workers"""

    task_id: str
    status: str
    step: str | None = None
    progress: int | None = None
    total: int | None = None
    result: dict[str, Any] | None = None
    error: str | None = None


@router.post("/broadcast-task-update")
async def broadcast_task_update(update: TaskUpdate):
    """Receive task updates from workers and broadcast to WebSocket clients.

    This endpoint is called by Celery workers to send progress updates
    to connected WebSocket clients.
    """
    try:
        # Determine message type based on the task step
        message_type = "processing_update"

        # Check if this is a sync task or a processing/deduplication task
        is_sync_task = False
        if update.step:
            step_lower = update.step.lower()
            # Sync tasks have specific keywords
            if (
                "syncing" in step_lower
                or "sync" in step_lower
                and "analyzing" not in step_lower
                or "loading documents" in step_lower
                and "database" not in step_lower
            ):
                is_sync_task = True
                message_type = "sync_update"
            # Processing/deduplication tasks
            elif (
                "analyzing" in step_lower
                or "processing" in step_lower
                or "deduplication" in step_lower
                or "duplicate" in step_lower
                or "loading document content" in step_lower
            ):
                is_sync_task = False
                message_type = "processing_update"

        # Build the status object matching what the frontend expects
        status_data = {
            "is_processing": update.status == "processing",
            "current_step": update.step or "",
            "progress": update.progress or 0,
            "total": update.total or 0,
            "error": update.error,
        }

        # Add result data if this is a completion
        if update.status == "completed" and update.result:
            status_data.update(update.result)

        # For sync updates, format differently
        if message_type == "sync_update":
            status_data = {
                "is_syncing": update.status == "processing",
                "current_step": update.step or "",
                "progress": update.progress or 0,
                "total": update.total or 0,
                "error": update.error,
            }
            if update.result:
                status_data.update(update.result)

        # Use the appropriate broadcast method based on message type
        if message_type == "processing_update":
            await manager.send_processing_update(status_data)
        elif message_type == "sync_update":
            await manager.send_sync_update(status_data)
        else:
            # Fallback to direct broadcast
            await manager.broadcast({"type": message_type, "data": status_data})

        logger.debug(
            f"Broadcasted {message_type} for {update.task_id}: {update.status}"
        )
        return {"status": "success", "message": "Update broadcast successfully"}

    except Exception as e:
        logger.error(f"Error broadcasting task update: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
