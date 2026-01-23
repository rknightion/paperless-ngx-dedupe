import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from celery import Task, current_task
from sqlalchemy.orm import Session

from paperless_dedupe.models.database import (
    BatchOperation,
    Document,
    DuplicateGroup,
    DuplicateMember,
)
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.database import get_worker_session
from paperless_dedupe.worker.utils import broadcast_task_status

logger = logging.getLogger(__name__)


class BatchOperationTask(Task):
    """Base task class with database session management"""

    def __init__(self):
        self.db: Session | None = None

    def before_start(self, task_id, args, kwargs):
        """Initialize database session before task starts"""
        self.db = get_worker_session()

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Clean up database session after task completes"""
        if self.db:
            self.db.close()
            self.db = None


@app.task(
    base=BatchOperationTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.batch_operations.run_batch_operation",
    max_retries=3,
)
def run_batch_operation(
    self,
    operation_id: str,
    operation: str,
    document_ids: list[int] | None = None,
    group_ids: list[int] | None = None,
    parameters: dict[str, Any] | None = None,
    broadcast_progress: bool = True,
) -> dict[str, Any]:
    """Execute batch operations and persist status in the database."""
    parameters = parameters or {}
    document_ids = document_ids or []
    group_ids = group_ids or []

    try:
        op_record = (
            self.db.query(BatchOperation)
            .filter(BatchOperation.id == operation_id)
            .first()
        )
        if not op_record:
            op_record = BatchOperation(
                id=operation_id,
                operation=operation,
                status="in_progress",
                total_items=len(group_ids or document_ids),
                processed_items=0,
                failed_items=0,
                current_item=0,
                parameters=parameters,
                created_at=datetime.now(UTC),
            )
            self.db.add(op_record)

        op_record.status = "in_progress"
        op_record.started_at = datetime.now(UTC)
        op_record.message = "Operation started"
        op_record.total_items = len(group_ids or document_ids)
        self.db.commit()

        processed = 0
        failed = 0
        errors: list[str] = []

        from paperless_dedupe.core.config_utils import get_current_paperless_config

        requires_paperless = operation in {
            "delete",
            "tag",
            "untag",
            "update_metadata",
            "resolve_duplicates",
        }
        client_settings = (
            get_current_paperless_config(self.db) if requires_paperless else {}
        )

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=current_task.request.id,
                    status="in_progress",
                    step=op_record.message,
                    progress=0,
                    total=op_record.total_items,
                    task_type="batch",
                    operation_id=operation_id,
                    result={"processed": 0, "failed": 0},
                    started_at=op_record.started_at,
                )
            )

        async def _run_document_operations(client: PaperlessClient):
            nonlocal processed, failed

            for idx, doc_id in enumerate(document_ids):
                try:
                    if operation == "mark_for_deletion":
                        pass
                    elif operation == "delete":
                        document = (
                            self.db.query(Document)
                            .filter(Document.id == doc_id)
                            .first()
                        )
                        if document and document.paperless_id:
                            await client.delete_document(document.paperless_id)
                            self.db.delete(document)
                    elif operation == "tag":
                        tags = parameters.get("tags", [])
                        document = (
                            self.db.query(Document)
                            .filter(Document.id == doc_id)
                            .first()
                        )
                        if document and document.paperless_id:
                            await client.add_tags_to_document(
                                document.paperless_id, tags
                            )
                    elif operation == "untag":
                        tags = parameters.get("tags", [])
                        document = (
                            self.db.query(Document)
                            .filter(Document.id == doc_id)
                            .first()
                        )
                        if document and document.paperless_id:
                            await client.remove_tags_from_document(
                                document.paperless_id, tags
                            )
                    elif operation == "update_metadata":
                        metadata = parameters.get("metadata", {})
                        document = (
                            self.db.query(Document)
                            .filter(Document.id == doc_id)
                            .first()
                        )
                        if document and document.paperless_id:
                            await client.update_document_metadata(
                                document.paperless_id, metadata
                            )
                            for key, value in metadata.items():
                                if hasattr(document, key):
                                    setattr(document, key, value)

                    processed += 1
                except Exception as e:
                    failed += 1
                    errors.append(f"Document {doc_id}: {str(e)}")
                    logger.error(
                        "Failed to process document %s: %s", doc_id, e, exc_info=True
                    )

                op_record.current_item = idx + 1
                op_record.processed_items = processed
                op_record.failed_items = failed
                op_record.message = (
                    f"Processing document {doc_id} ({idx + 1}/{len(document_ids)})"
                )

                if idx % 25 == 0 or idx == len(document_ids) - 1:
                    self.db.commit()

                if broadcast_progress and idx % 100 == 0:
                    await broadcast_task_status(
                        task_id=current_task.request.id,
                        status="in_progress",
                        step=op_record.message,
                        progress=idx + 1,
                        total=len(document_ids),
                        task_type="batch",
                        operation_id=operation_id,
                        result={"processed": processed, "failed": failed},
                    )

        async def _run_group_operations(client: PaperlessClient | None):
            nonlocal processed, failed
            keep_primary = bool(parameters.get("keep_primary", True))
            reviewed = bool(parameters.get("reviewed", True))

            documents_to_delete: list[int] = []

            for idx, group_id in enumerate(group_ids):
                group = (
                    self.db.query(DuplicateGroup)
                    .filter(DuplicateGroup.id == group_id)
                    .first()
                )
                if not group:
                    failed += 1
                    errors.append(f"Group {group_id}: not found")
                    continue

                if operation == "mark_reviewed":
                    group.reviewed = reviewed
                elif operation == "resolve_duplicates":
                    group.reviewed = True
                    group.resolved = True
                    for member in group.members:
                        if keep_primary and member.is_primary:
                            continue
                        documents_to_delete.append(member.document_id)

                processed += 1
                op_record.current_item = idx + 1
                op_record.processed_items = processed
                op_record.failed_items = failed
                op_record.message = (
                    f"Processing group {group_id} ({idx + 1}/{len(group_ids)})"
                )

                if idx % 25 == 0 or idx == len(group_ids) - 1:
                    self.db.commit()

                if broadcast_progress and idx % 100 == 0:
                    await broadcast_task_status(
                        task_id=current_task.request.id,
                        status="in_progress",
                        step=op_record.message,
                        progress=idx + 1,
                        total=len(group_ids),
                        task_type="batch",
                        operation_id=operation_id,
                        result={"processed": processed, "failed": failed},
                    )

            self.db.commit()

            if documents_to_delete:
                documents_to_delete = list(dict.fromkeys(documents_to_delete))

            if documents_to_delete and client:
                for doc_id in documents_to_delete:
                    try:
                        document = (
                            self.db.query(Document)
                            .filter(Document.id == doc_id)
                            .first()
                        )
                        if document and document.paperless_id:
                            await client.delete_document(document.paperless_id)
                        if document:
                            self.db.delete(document)
                    except Exception as e:
                        failed += 1
                        errors.append(f"Document {doc_id}: {str(e)}")
                        logger.error(
                            "Failed to delete document %s: %s",
                            doc_id,
                            e,
                            exc_info=True,
                        )

                self.db.commit()

        if operation in {"mark_reviewed", "resolve_duplicates"}:
            if requires_paperless:

                async def _run_groups():
                    async with PaperlessClient(**client_settings) as client:
                        await _run_group_operations(client)

                asyncio.run(_run_groups())
            else:
                asyncio.run(_run_group_operations(None))
        else:

            async def _run_documents():
                async with PaperlessClient(**client_settings) as client:
                    await _run_document_operations(client)

            asyncio.run(_run_documents())

        if failed == 0:
            op_record.status = "completed"
        elif processed == 0:
            op_record.status = "failed"
        else:
            op_record.status = "partially_completed"

        op_record.completed_at = datetime.now(UTC)
        op_record.errors = errors
        op_record.message = f"Processed {processed}/{len(group_ids or document_ids)} items, {failed} failed"
        self.db.commit()

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=current_task.request.id,
                    status=op_record.status,
                    step=op_record.message,
                    progress=op_record.current_item,
                    total=op_record.total_items,
                    task_type="batch",
                    operation_id=operation_id,
                    result={
                        "processed": processed,
                        "failed": failed,
                        "started_at": op_record.started_at,
                        "completed_at": op_record.completed_at,
                    },
                    started_at=op_record.started_at,
                    completed_at=op_record.completed_at,
                )
            )

        return {
            "status": op_record.status,
            "processed": processed,
            "failed": failed,
            "total": len(group_ids or document_ids),
        }

    except Exception as e:
        self.db.rollback()
        op_record = (
            self.db.query(BatchOperation)
            .filter(BatchOperation.id == operation_id)
            .first()
        )
        if op_record:
            op_record.status = "failed"
            op_record.message = str(e)
            op_record.completed_at = datetime.now(UTC)
            self.db.commit()
            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=current_task.request.id,
                        status="failed",
                        step=str(e),
                        progress=op_record.current_item,
                        total=op_record.total_items,
                        task_type="batch",
                        operation_id=operation_id,
                        result={
                            "processed": op_record.processed_items,
                            "failed": op_record.failed_items,
                            "started_at": op_record.started_at,
                            "completed_at": op_record.completed_at,
                        },
                        error=str(e),
                        started_at=op_record.started_at,
                        completed_at=op_record.completed_at,
                    )
                )
        logger.error("Batch operation failed: %s", e, exc_info=True)
        raise self.retry(exc=e) from e


@app.task(
    base=BatchOperationTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.batch_operations.mark_duplicates_reviewed",
    max_retries=3,
)
def mark_duplicates_reviewed(
    self, group_ids: list[str], broadcast_progress: bool = True
) -> dict[str, Any]:
    """Mark multiple duplicate groups as reviewed.

    Args:
        group_ids: List of duplicate group IDs to mark as reviewed
        broadcast_progress: Whether to broadcast progress

    Returns:
        Dictionary with operation results
    """
    try:
        task_id = current_task.request.id
        total = len(group_ids)
        processed = 0
        failed = 0

        # Update initial state
        self.update_state(
            state="PROGRESS",
            meta={
                "current_step": "Marking duplicate groups as reviewed",
                "progress": 0,
                "total": total,
            },
        )

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step="Marking duplicate groups as reviewed",
                    progress=0,
                    total=total,
                )
            )

        # Process each group
        for idx, group_id in enumerate(group_ids):
            try:
                group = self.db.query(DuplicateGroup).filter_by(id=group_id).first()
                if group:
                    group.reviewed = True
                    processed += 1
                else:
                    logger.warning(f"Group {group_id} not found")
                    failed += 1

                # Update progress
                if idx % 10 == 0:
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "current_step": f"Processing group {idx + 1}/{total}",
                            "progress": idx + 1,
                            "total": total,
                        },
                    )

                    if broadcast_progress and idx % 50 == 0:
                        asyncio.run(
                            broadcast_task_status(
                                task_id=task_id,
                                status="processing",
                                step="Marking groups as reviewed",
                                progress=idx + 1,
                                total=total,
                            )
                        )

            except Exception as e:
                logger.error(f"Error processing group {group_id}: {str(e)}")
                failed += 1

        # Commit changes
        self.db.commit()

        result = {
            "status": "completed",
            "task_id": task_id,
            "groups_processed": processed,
            "groups_failed": failed,
            "total_groups": total,
        }

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="completed",
                    step="Batch review complete",
                    result=result,
                )
            )

        return result

    except Exception as e:
        logger.error(f"Error in batch review task: {str(e)}")
        self.db.rollback()
        raise self.retry(exc=e) from e


@app.task(
    base=BatchOperationTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.batch_operations.resolve_duplicate_groups",
    max_retries=3,
)
def resolve_duplicate_groups(
    self,
    group_ids: list[str],
    keep_primary: bool = True,
    broadcast_progress: bool = True,
) -> dict[str, Any]:
    """Resolve duplicate groups by marking them as resolved.

    Args:
        group_ids: List of duplicate group IDs to resolve
        keep_primary: Whether to keep the primary document
        broadcast_progress: Whether to broadcast progress

    Returns:
        Dictionary with operation results
    """
    try:
        task_id = current_task.request.id
        total = len(group_ids)
        processed = 0
        documents_affected = 0

        self.update_state(
            state="PROGRESS",
            meta={
                "current_step": "Resolving duplicate groups",
                "progress": 0,
                "total": total,
            },
        )

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step="Resolving duplicate groups",
                    progress=0,
                    total=total,
                )
            )

        for idx, group_id in enumerate(group_ids):
            try:
                group = self.db.query(DuplicateGroup).filter_by(id=group_id).first()
                if group:
                    group.resolved = True
                    group.reviewed = True

                    # Count affected documents
                    members = (
                        self.db.query(DuplicateMember)
                        .filter_by(group_id=group_id)
                        .all()
                    )
                    documents_affected += len(members)

                    processed += 1

                # Update progress
                if idx % 5 == 0:
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "current_step": f"Resolving group {idx + 1}/{total}",
                            "progress": idx + 1,
                            "total": total,
                        },
                    )

                    if broadcast_progress and idx % 20 == 0:
                        asyncio.run(
                            broadcast_task_status(
                                task_id=task_id,
                                status="processing",
                                step="Resolving groups",
                                progress=idx + 1,
                                total=total,
                            )
                        )

            except Exception as e:
                logger.error(f"Error resolving group {group_id}: {str(e)}")

        self.db.commit()

        result = {
            "status": "completed",
            "task_id": task_id,
            "groups_resolved": processed,
            "documents_affected": documents_affected,
            "total_groups": total,
        }

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="completed",
                    step="Resolution complete",
                    result=result,
                )
            )

        return result

    except Exception as e:
        logger.error(f"Error in resolve groups task: {str(e)}")
        self.db.rollback()
        raise self.retry(exc=e) from e


@app.task(
    base=BatchOperationTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.batch_operations.tag_documents",
    max_retries=3,
)
def tag_documents(
    self, document_ids: list[int], tag_names: list[str], broadcast_progress: bool = True
) -> dict[str, Any]:
    """Add tags to multiple documents in paperless-ngx.

    Args:
        document_ids: List of document IDs to tag
        tag_names: List of tag names to add
        broadcast_progress: Whether to broadcast progress

    Returns:
        Dictionary with operation results
    """
    try:
        task_id = current_task.request.id
        total = len(document_ids)

        self.update_state(
            state="PROGRESS",
            meta={
                "current_step": "Adding tags to documents",
                "progress": 0,
                "total": total,
            },
        )

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step="Adding tags to documents",
                    progress=0,
                    total=total,
                )
            )

        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config

        client_settings = get_current_paperless_config(self.db)

        # Run async tagging operation
        result = asyncio.run(
            self._tag_documents_async(
                client_settings, document_ids, tag_names, broadcast_progress
            )
        )

        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=task_id,
                    status="completed",
                    step="Tagging complete",
                    result=result,
                )
            )

        return result

    except Exception as e:
        logger.error(f"Error in tag documents task: {str(e)}")
        raise self.retry(exc=e) from e

    async def _tag_documents_async(
        self,
        client_settings: dict,
        document_ids: list[int],
        tag_names: list[str],
        broadcast_progress: bool,
    ) -> dict[str, Any]:
        """Async implementation of document tagging"""
        processed = 0
        failed = 0
        errors = []

        async with PaperlessClient(**client_settings) as client:
            # First, ensure tags exist in paperless
            await client.ensure_tags_exist(tag_names)

            # Process each document
            for idx, doc_id in enumerate(document_ids):
                try:
                    # Get document from database
                    doc = self.db.query(Document).filter_by(id=doc_id).first()
                    if not doc:
                        logger.warning(f"Document {doc_id} not found in database")
                        failed += 1
                        continue

                    # Add tags via paperless API
                    await client.add_tags_to_document(doc.paperless_id, tag_names)
                    processed += 1

                    # Update progress
                    if idx % 10 == 0:
                        self.update_state(
                            state="PROGRESS",
                            meta={
                                "current_step": f"Tagging document {idx + 1}/{len(document_ids)}",
                                "progress": idx + 1,
                                "total": len(document_ids),
                            },
                        )

                        if broadcast_progress and idx % 50 == 0:
                            await broadcast_task_status(
                                task_id=current_task.request.id,
                                status="processing",
                                step="Tagging documents",
                                progress=idx + 1,
                                total=len(document_ids),
                            )

                except Exception as e:
                    logger.error(f"Error tagging document {doc_id}: {str(e)}")
                    errors.append(f"Document {doc_id}: {str(e)}")
                    failed += 1

        return {
            "status": "completed",
            "documents_tagged": processed,
            "documents_failed": failed,
            "tags_added": tag_names,
            "errors": errors[:10],  # Limit error details
        }


@app.task(name="paperless_dedupe.worker.tasks.batch_operations.delete_duplicate_groups")
def delete_duplicate_groups(group_ids: list[str]) -> dict[str, Any]:
    """Delete duplicate groups and their members.

    Args:
        group_ids: List of duplicate group IDs to delete

    Returns:
        Dictionary with deletion results
    """
    db = get_worker_session()
    try:
        deleted_groups = 0
        deleted_members = 0

        for group_id in group_ids:
            # Delete members first (cascade should handle this, but being explicit)
            members = db.query(DuplicateMember).filter_by(group_id=group_id).all()
            deleted_members += len(members)
            for member in members:
                db.delete(member)

            # Delete group
            group = db.query(DuplicateGroup).filter_by(id=group_id).first()
            if group:
                db.delete(group)
                deleted_groups += 1

        db.commit()

        return {
            "status": "completed",
            "groups_deleted": deleted_groups,
            "members_deleted": deleted_members,
        }

    except Exception as e:
        logger.error(f"Error deleting duplicate groups: {str(e)}")
        db.rollback()
        raise

    finally:
        db.close()
