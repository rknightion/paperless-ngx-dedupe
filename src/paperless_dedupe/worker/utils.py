import json
import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def broadcast_task_status(
    task_id: str,
    status: str,
    step: str = "",
    progress: int = 0,
    total: int = 0,
    error: str | None = None,
    result: dict[str, Any] | None = None,
    websocket_url: str | None = None,
    task_type: str | None = None,
    job_id: int | None = None,
    operation_id: str | None = None,
    started_at: Any | None = None,
    completed_at: Any | None = None,
) -> None:
    """Broadcast task status updates via WebSocket through the FastAPI server.

    Args:
        task_id: Celery task ID
        status: Task status (processing, completed, failed)
        step: Current processing step description
        progress: Current progress count
        total: Total items to process
        error: Error message if task failed
        result: Task result data
        websocket_url: Base URL of the FastAPI server
        task_type: Optional task category identifier
        job_id: Optional job identifier (for AI jobs)
        operation_id: Optional batch operation identifier
    """
    try:
        # Determine the WebSocket URL based on environment
        if websocket_url is None:
            import os

            # In Docker, use container name; locally use localhost
            if os.environ.get("DOCKER_CONTAINER"):
                websocket_url = "http://paperless-dedupe:8000"
            else:
                websocket_url = "http://localhost:30001"

        # Prepare status update payload matching TaskUpdate model
        update_data = {
            "task_id": task_id,
            "status": status,
            "step": step,
            "progress": progress,
            "total": total,
            "error": error,
            "result": result,
            "task_type": task_type,
        }
        if job_id is not None:
            update_data["job_id"] = job_id
        if operation_id is not None:
            update_data["operation_id"] = operation_id

        if started_at:
            if isinstance(started_at, datetime):
                update_data["started_at"] = started_at.isoformat()
            else:
                update_data["started_at"] = str(started_at)

        if completed_at:
            if isinstance(completed_at, datetime):
                update_data["completed_at"] = completed_at.isoformat()
            else:
                update_data["completed_at"] = str(completed_at)

        # Send update to FastAPI server endpoint that will broadcast via WebSocket
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{websocket_url}/api/v1/internal/broadcast-task-update",
                json=update_data,
                timeout=5.0,
            )

            if response.status_code != 200:
                logger.warning(
                    f"Failed to broadcast task update: {response.status_code}"
                )

    except Exception as e:
        # Don't let broadcast errors affect the task
        logger.error(f"Error broadcasting task status: {str(e)}")


async def get_database_session():
    """Get a database session for async operations.

    This is a utility for tasks that need database access.
    """
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    from paperless_dedupe.core.config import settings

    # Convert sync database URL to async if needed
    db_url = settings.database_url
    if db_url.startswith("sqlite"):
        db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://")
    elif db_url.startswith("postgresql"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")

    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        return session


def parse_celery_task_result(task_result: Any) -> dict:
    """Parse Celery task result into a standardized format.

    Args:
        task_result: Raw Celery task result

    Returns:
        Standardized task result dictionary
    """
    if isinstance(task_result, dict):
        return task_result

    try:
        # Try to parse as JSON if it's a string
        if isinstance(task_result, str):
            return json.loads(task_result)
    except (json.JSONDecodeError, TypeError):
        pass

    # Return as wrapped result if we can't parse it
    return {"status": "completed", "result": str(task_result)}


def calculate_eta(progress: int, total: int, start_time: datetime) -> datetime | None:
    """Calculate estimated time of arrival for task completion.

    Args:
        progress: Current progress count
        total: Total items to process
        start_time: When the task started

    Returns:
        Estimated completion datetime or None if can't calculate
    """
    if progress <= 0 or total <= 0:
        return None

    elapsed = (datetime.utcnow() - start_time).total_seconds()
    rate = progress / elapsed  # items per second

    if rate <= 0:
        return None

    remaining = total - progress
    eta_seconds = remaining / rate

    return datetime.utcnow() + timedelta(seconds=eta_seconds)


def format_task_duration(seconds: float) -> str:
    """Format task duration in human-readable format.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted duration string
    """
    if seconds < 60:
        return f"{seconds:.1f} seconds"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f} minutes"
    else:
        hours = seconds / 3600
        return f"{hours:.1f} hours"
