import asyncio
import logging
from datetime import datetime
from typing import Any, List, Optional

from celery import Task, current_task
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import Document, DuplicateGroup, DuplicateMember
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.utils import broadcast_task_status
from paperless_dedupe.worker.database import get_worker_session

logger = logging.getLogger(__name__)


class BatchOperationTask(Task):
    """Base task class with database session management"""

    def __init__(self):
        self.db: Optional[Session] = None

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
    name='paperless_dedupe.worker.tasks.batch_operations.mark_duplicates_reviewed',
    max_retries=3
)
def mark_duplicates_reviewed(
    self,
    group_ids: List[str],
    broadcast_progress: bool = True
) -> dict[str, Any]:
    """
    Mark multiple duplicate groups as reviewed.

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
            state='PROGRESS',
            meta={
                'current_step': 'Marking duplicate groups as reviewed',
                'progress': 0,
                'total': total
            }
        )

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='processing',
                step='Marking duplicate groups as reviewed',
                progress=0,
                total=total
            ))

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
                        state='PROGRESS',
                        meta={
                            'current_step': f'Processing group {idx + 1}/{total}',
                            'progress': idx + 1,
                            'total': total
                        }
                    )

                    if broadcast_progress and idx % 50 == 0:
                        asyncio.run(broadcast_task_status(
                            task_id=task_id,
                            status='processing',
                            step='Marking groups as reviewed',
                            progress=idx + 1,
                            total=total
                        ))

            except Exception as e:
                logger.error(f"Error processing group {group_id}: {str(e)}")
                failed += 1

        # Commit changes
        self.db.commit()

        result = {
            'status': 'completed',
            'task_id': task_id,
            'groups_processed': processed,
            'groups_failed': failed,
            'total_groups': total
        }

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='completed',
                step='Batch review complete',
                result=result
            ))

        return result

    except Exception as e:
        logger.error(f"Error in batch review task: {str(e)}")
        self.db.rollback()
        raise self.retry(exc=e)


@app.task(
    base=BatchOperationTask,
    bind=True,
    name='paperless_dedupe.worker.tasks.batch_operations.resolve_duplicate_groups',
    max_retries=3
)
def resolve_duplicate_groups(
    self,
    group_ids: List[str],
    keep_primary: bool = True,
    broadcast_progress: bool = True
) -> dict[str, Any]:
    """
    Resolve duplicate groups by marking them as resolved.

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
            state='PROGRESS',
            meta={
                'current_step': 'Resolving duplicate groups',
                'progress': 0,
                'total': total
            }
        )

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='processing',
                step='Resolving duplicate groups',
                progress=0,
                total=total
            ))

        for idx, group_id in enumerate(group_ids):
            try:
                group = self.db.query(DuplicateGroup).filter_by(id=group_id).first()
                if group:
                    group.resolved = True
                    group.reviewed = True

                    # Count affected documents
                    members = self.db.query(DuplicateMember).filter_by(
                        group_id=group_id
                    ).all()
                    documents_affected += len(members)

                    processed += 1

                # Update progress
                if idx % 5 == 0:
                    self.update_state(
                        state='PROGRESS',
                        meta={
                            'current_step': f'Resolving group {idx + 1}/{total}',
                            'progress': idx + 1,
                            'total': total
                        }
                    )

                    if broadcast_progress and idx % 20 == 0:
                        asyncio.run(broadcast_task_status(
                            task_id=task_id,
                            status='processing',
                            step='Resolving groups',
                            progress=idx + 1,
                            total=total
                        ))

            except Exception as e:
                logger.error(f"Error resolving group {group_id}: {str(e)}")

        self.db.commit()

        result = {
            'status': 'completed',
            'task_id': task_id,
            'groups_resolved': processed,
            'documents_affected': documents_affected,
            'total_groups': total
        }

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='completed',
                step='Resolution complete',
                result=result
            ))

        return result

    except Exception as e:
        logger.error(f"Error in resolve groups task: {str(e)}")
        self.db.rollback()
        raise self.retry(exc=e)


@app.task(
    base=BatchOperationTask,
    bind=True,
    name='paperless_dedupe.worker.tasks.batch_operations.tag_documents',
    max_retries=3
)
def tag_documents(
    self,
    document_ids: List[int],
    tag_names: List[str],
    broadcast_progress: bool = True
) -> dict[str, Any]:
    """
    Add tags to multiple documents in paperless-ngx.

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
            state='PROGRESS',
            meta={
                'current_step': 'Adding tags to documents',
                'progress': 0,
                'total': total
            }
        )

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='processing',
                step='Adding tags to documents',
                progress=0,
                total=total
            ))

        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config
        client_settings = get_current_paperless_config(self.db)

        # Run async tagging operation
        result = asyncio.run(self._tag_documents_async(
            client_settings,
            document_ids,
            tag_names,
            broadcast_progress
        ))

        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='completed',
                step='Tagging complete',
                result=result
            ))

        return result

    except Exception as e:
        logger.error(f"Error in tag documents task: {str(e)}")
        raise self.retry(exc=e)

    async def _tag_documents_async(
        self,
        client_settings: dict,
        document_ids: List[int],
        tag_names: List[str],
        broadcast_progress: bool
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
                            state='PROGRESS',
                            meta={
                                'current_step': f'Tagging document {idx + 1}/{len(document_ids)}',
                                'progress': idx + 1,
                                'total': len(document_ids)
                            }
                        )

                        if broadcast_progress and idx % 50 == 0:
                            await broadcast_task_status(
                                task_id=current_task.request.id,
                                status='processing',
                                step='Tagging documents',
                                progress=idx + 1,
                                total=len(document_ids)
                            )

                except Exception as e:
                    logger.error(f"Error tagging document {doc_id}: {str(e)}")
                    errors.append(f"Document {doc_id}: {str(e)}")
                    failed += 1

        return {
            'status': 'completed',
            'documents_tagged': processed,
            'documents_failed': failed,
            'tags_added': tag_names,
            'errors': errors[:10]  # Limit error details
        }


@app.task(
    name='paperless_dedupe.worker.tasks.batch_operations.delete_duplicate_groups'
)
def delete_duplicate_groups(
    group_ids: List[str]
) -> dict[str, Any]:
    """
    Delete duplicate groups and their members.

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
            'status': 'completed',
            'groups_deleted': deleted_groups,
            'members_deleted': deleted_members
        }

    except Exception as e:
        logger.error(f"Error deleting duplicate groups: {str(e)}")
        db.rollback()
        raise

    finally:
        db.close()