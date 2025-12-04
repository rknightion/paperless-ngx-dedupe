from datetime import datetime

from paperless_dedupe.core.task_status import (
    merge_processing_status,
    merge_sync_status,
    processing_status_snapshot,
    start_processing_status,
    start_sync_status,
    sync_status_snapshot,
)


def test_start_and_merge_sync_status():
    start_sync_status(task_id="sync-1", started_at=datetime(2024, 1, 1))
    snapshot = sync_status_snapshot()
    assert snapshot["is_syncing"] is True
    assert snapshot["task_id"] == "sync-1"
    assert snapshot["started_at"].startswith("2024-01-01")

    merged = merge_sync_status(
        {
            "task_id": "sync-1",
            "status": "processing",
            "step": "Syncing",
            "progress": 5,
            "total": 10,
        }
    )
    assert merged["progress"] == 5
    assert merged["total"] == 10
    assert merged["current_step"] == "Syncing"

    completed = merge_sync_status(
        {
            "task_id": "sync-1",
            "status": "completed",
            "result": {"documents_synced": 10, "errors": []},
            "completed_at": datetime(2024, 1, 1, 1, 0, 0),
        }
    )
    assert completed["is_syncing"] is False
    assert completed["documents_synced"] == 10
    assert completed["errors"] == []
    assert completed["completed_at"].startswith("2024-01-01T01:00:00")


def test_start_and_merge_processing_status():
    start_processing_status(task_id="proc-1", started_at="2024-02-02T00:00:00Z")
    snapshot = processing_status_snapshot()
    assert snapshot["is_processing"] is True
    assert snapshot["task_id"] == "proc-1"
    assert snapshot["started_at"].startswith("2024-02-02")

    merged = merge_processing_status(
        {
            "task_id": "proc-1",
            "status": "processing",
            "step": "Analyzing",
            "progress": 3,
            "total": 5,
            "result": {"documents_processed": 3},
        }
    )
    assert merged["progress"] == 3
    assert merged["total"] == 5
    assert merged["documents_processed"] == 3

    completed = merge_processing_status(
        {
            "task_id": "proc-1",
            "status": "completed",
            "result": {
                "documents_processed": 5,
                "duplicate_groups_found": 1,
                "errors": [],
            },
            "completed_at": "2024-02-02T01:00:00Z",
        }
    )
    assert completed["is_processing"] is False
    assert completed["documents_processed"] == 5
    assert completed["duplicate_groups_found"] == 1
    assert completed["errors"] == []
    assert completed["completed_at"].startswith("2024-02-02T01:00:00")
