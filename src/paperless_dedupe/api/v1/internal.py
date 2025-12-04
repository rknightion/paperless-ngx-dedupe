"""Internal API endpoints for worker communication"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from paperless_dedupe.api.v1.websocket import manager
from paperless_dedupe.core.task_status import (
    merge_processing_status,
    merge_sync_status,
)

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
    started_at: str | None = None
    completed_at: str | None = None
    task_type: str | None = None


@router.post("/broadcast-task-update")
async def broadcast_task_update(update: TaskUpdate):
    """Receive task updates from workers and broadcast to WebSocket clients.

    This endpoint is called by Celery workers to send progress updates
    to connected WebSocket clients.
    """
    try:
        # Determine message type with explicit task_type override
        if update.task_type == "sync":
            message_type = "sync_update"
        elif update.task_type in {"processing", "analysis", "deduplication"}:
            message_type = "processing_update"
        else:
            message_type = "processing_update"

        if not update.task_type and update.step:
            step_lower = update.step.lower()
            if "sync" in step_lower or "document sync" in step_lower:
                message_type = "sync_update"
            elif (
                "analyzing" in step_lower
                or "processing" in step_lower
                or "deduplication" in step_lower
                or "duplicate" in step_lower
            ):
                message_type = "processing_update"

        # Build the status object matching what the frontend expects
        status_data = {
            "current_step": update.step or "",
            "progress": update.progress or 0,
            "total": update.total or 0,
            "error": update.error,
            "started_at": update.started_at,
            "completed_at": update.completed_at,
        }

        # Add result data if this is a completion
        if update.status == "completed" and update.result:
            status_data.update(update.result)

        # For sync updates, format differently
        if message_type == "sync_update":
            status_data["is_syncing"] = update.status == "processing"

        # Merge into shared status stores for API access
        if message_type == "sync_update":
            merged = merge_sync_status(
                {
                    **status_data,
                    "status": update.status,
                    "task_id": update.task_id,
                    "result": update.result,
                }
            )
            status_data = merged
        else:
            merged = merge_processing_status(
                {
                    **status_data,
                    "status": update.status,
                    "task_id": update.task_id,
                    "result": update.result,
                }
            )
            status_data = merged

        # Use the appropriate broadcast method based on message type
        if message_type == "processing_update":
            await manager.send_processing_update(status_data)
            if update.status == "completed":
                await manager.send_completion(status_data)
        elif message_type == "sync_update":
            await manager.send_sync_update(status_data)
            if update.status == "completed":
                await manager.send_sync_completion(status_data)
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
