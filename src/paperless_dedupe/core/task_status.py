from __future__ import annotations

from collections.abc import MutableMapping
from datetime import datetime
from typing import Any, cast


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
processing_history_state: list[dict[str, Any]] = []
_MAX_PROCESSING_HISTORY = 50


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


def _history_entry_exists(task_id: str | None, status: str | None) -> bool:
    if not task_id or not status:
        return False
    return any(
        entry.get("id") == task_id and entry.get("status") == status
        for entry in processing_history_state
    )


def _build_processing_history_entry(update: dict[str, Any]) -> dict[str, Any]:
    task_id = update.get("task_id") or processing_status_state.get("task_id")
    status = (
        update.get("status") or processing_status_state.get("status") or "completed"
    )
    result = update.get("result") or {}
    if not isinstance(result, dict):
        result = {}

    documents_processed = (
        update.get("documents_processed")
        or result.get("documents_processed")
        or processing_status_state.get("documents_processed")
        or 0
    )

    groups_found = (
        update.get("groups_found")
        or result.get("groups_found")
        or update.get("duplicate_groups_found")
        or result.get("duplicate_groups_found")
        or processing_status_state.get("duplicate_groups_found")
        or 0
    )

    started_at = _normalize_timestamp(
        update.get("started_at") or processing_status_state.get("started_at")
    )
    completed_at = _normalize_timestamp(
        update.get("completed_at")
        or processing_status_state.get("completed_at")
        or datetime.utcnow()
    )

    return {
        "id": task_id or f"run_{int(datetime.utcnow().timestamp())}",
        "started_at": started_at,
        "completed_at": completed_at,
        "status": status,
        "documents_processed": documents_processed,
        "groups_found": groups_found,
        "error": update.get("error") or result.get("error"),
    }


def record_processing_history(update: dict[str, Any]) -> dict[str, Any]:
    """Record a completed/failed/cancelled processing run in history."""
    status = cast(str | None, update.get("status"))
    task_id = cast(str | None, update.get("task_id"))

    if status and _history_entry_exists(task_id, status):
        # Avoid duplicate entries for the same task/status
        return _build_processing_history_entry(update)

    entry = _build_processing_history_entry(update)
    processing_history_state.insert(0, entry)
    if len(processing_history_state) > _MAX_PROCESSING_HISTORY:
        processing_history_state[:] = processing_history_state[:_MAX_PROCESSING_HISTORY]
    return entry


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

    if status in {"completed", "failed"}:
        record_processing_history(update)

    return processing_status_state.copy()


def processing_history_snapshot() -> list[dict[str, Any]]:
    """Return a copy of the processing history list."""
    return [entry.copy() for entry in processing_history_state]


def sync_status_snapshot() -> dict[str, Any]:
    return sync_status_state.copy()


def processing_status_snapshot() -> dict[str, Any]:
    return processing_status_state.copy()
