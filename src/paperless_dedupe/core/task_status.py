from __future__ import annotations

from collections.abc import MutableMapping
from datetime import datetime
from typing import Any


def _normalize_timestamp(value: Any | None) -> str | None:
    """Convert datetimes to ISO strings and passthrough existing strings."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _default_sync_status() -> dict[str, Any]:
    return {
        "is_syncing": False,
        "current_step": "",
        "progress": 0,
        "total": 0,
        "started_at": None,
        "completed_at": None,
        "error": None,
        "documents_synced": 0,
        "documents_updated": 0,
        "task_id": None,
        "status": None,
        "errors": [],
    }


def _default_processing_status() -> dict[str, Any]:
    return {
        "is_processing": False,
        "current_step": "",
        "progress": 0,
        "total": 0,
        "started_at": None,
        "completed_at": None,
        "error": None,
        "task_id": None,
        "status": None,
        "errors": [],
    }


sync_status_state: dict[str, Any] = _default_sync_status()
processing_status_state: dict[str, Any] = _default_processing_status()


def _reset(target: MutableMapping[str, Any], defaults: dict[str, Any]) -> None:
    target.clear()
    target.update(defaults)


def start_sync_status(task_id: str | None = None, started_at: Any | None = None):
    """Reset and mark a sync task as started."""
    _reset(sync_status_state, _default_sync_status())
    sync_status_state.update(
        {
            "is_syncing": True,
            "started_at": _normalize_timestamp(started_at)
            or datetime.utcnow().isoformat(),
            "task_id": task_id,
            "status": "processing",
        }
    )
    return sync_status_state.copy()


def start_processing_status(task_id: str | None = None, started_at: Any | None = None):
    """Reset and mark a processing task as started."""
    _reset(processing_status_state, _default_processing_status())
    processing_status_state.update(
        {
            "is_processing": True,
            "started_at": _normalize_timestamp(started_at)
            or datetime.utcnow().isoformat(),
            "task_id": task_id,
            "status": "processing",
        }
    )
    return processing_status_state.copy()


def _update_counts(target: MutableMapping[str, Any], payload: dict[str, Any]) -> None:
    for key in (
        "documents_synced",
        "documents_updated",
        "documents_processed",
        "duplicates_found",
        "duplicate_groups_found",
        "total_documents",
    ):
        if payload.get(key) is not None:
            target[key] = payload[key]


def merge_sync_status(update: dict[str, Any]) -> dict[str, Any]:
    """Merge an incoming sync update into the shared state."""
    status = update.get("status")
    if status == "processing":
        sync_status_state["is_syncing"] = True
        if not sync_status_state.get("started_at"):
            sync_status_state["started_at"] = datetime.utcnow().isoformat()
    elif status in {"completed", "failed"}:
        sync_status_state["is_syncing"] = False
        sync_status_state["completed_at"] = (
            _normalize_timestamp(update.get("completed_at"))
            or sync_status_state.get("completed_at")
            or datetime.utcnow().isoformat()
        )

    if update.get("task_id"):
        sync_status_state["task_id"] = update["task_id"]

    if update.get("step") or update.get("current_step"):
        sync_status_state["current_step"] = update.get("step") or update.get(
            "current_step"
        )

    if update.get("progress") is not None:
        sync_status_state["progress"] = int(update["progress"])
    if update.get("total") is not None:
        sync_status_state["total"] = int(update["total"])
    if update.get("error") is not None:
        sync_status_state["error"] = update["error"]
    if update.get("started_at"):
        sync_status_state["started_at"] = _normalize_timestamp(update["started_at"])
    if update.get("completed_at"):
        sync_status_state["completed_at"] = _normalize_timestamp(update["completed_at"])

    _update_counts(sync_status_state, update)

    result = update.get("result") or {}
    if isinstance(result, dict):
        _update_counts(sync_status_state, result)
        if result.get("status"):
            sync_status_state["status"] = result["status"]
        if result.get("errors") is not None:
            sync_status_state["errors"] = result.get("errors")

    return sync_status_state.copy()


def merge_processing_status(update: dict[str, Any]) -> dict[str, Any]:
    """Merge an incoming processing update into the shared state."""
    status = update.get("status")
    if status == "processing":
        processing_status_state["is_processing"] = True
        if not processing_status_state.get("started_at"):
            processing_status_state["started_at"] = datetime.utcnow().isoformat()
    elif status in {"completed", "failed"}:
        processing_status_state["is_processing"] = False
        processing_status_state["completed_at"] = (
            _normalize_timestamp(update.get("completed_at"))
            or processing_status_state.get("completed_at")
            or datetime.utcnow().isoformat()
        )

    if update.get("task_id"):
        processing_status_state["task_id"] = update["task_id"]

    if update.get("step") or update.get("current_step"):
        processing_status_state["current_step"] = update.get("step") or update.get(
            "current_step"
        )

    if update.get("progress") is not None:
        processing_status_state["progress"] = int(update["progress"])
    if update.get("total") is not None:
        processing_status_state["total"] = int(update["total"])
    if update.get("error") is not None:
        processing_status_state["error"] = update["error"]
    if update.get("started_at"):
        processing_status_state["started_at"] = _normalize_timestamp(
            update["started_at"]
        )
    if update.get("completed_at"):
        processing_status_state["completed_at"] = _normalize_timestamp(
            update["completed_at"]
        )

    _update_counts(processing_status_state, update)

    result = update.get("result") or {}
    if isinstance(result, dict):
        _update_counts(processing_status_state, result)
        if result.get("status"):
            processing_status_state["status"] = result["status"]
        if result.get("errors") is not None:
            processing_status_state["errors"] = result.get("errors")

    return processing_status_state.copy()


def sync_status_snapshot() -> dict[str, Any]:
    return sync_status_state.copy()


def processing_status_snapshot() -> dict[str, Any]:
    return processing_status_state.copy()
