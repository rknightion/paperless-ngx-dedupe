import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from celery import Task, current_task
from celery.exceptions import SoftTimeLimitExceeded
from dateutil import parser as date_parser
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import Document, DocumentContent
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.utils import broadcast_task_status
from paperless_dedupe.worker.database import get_worker_session

logger = logging.getLogger(__name__)


def parse_date_field(date_value):
    """Parse date field from various formats to Python datetime"""
    if date_value is None:
        return None
    if isinstance(date_value, datetime):
        # If datetime but naive, make it UTC-aware
        if date_value.tzinfo is None:
            return date_value.replace(tzinfo=timezone.utc)
        return date_value
    if isinstance(date_value, str):
        try:
            parsed = date_parser.parse(date_value)
            # If parsed datetime is naive, make it UTC-aware
            if parsed and parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except (ValueError, TypeError):
            return None
    return None


async def _sync_documents_async(
    db: Session,
    client_settings: dict,
    force_refresh: bool,
    limit: int,
    broadcast_progress: bool,
    task_id: str
) -> dict[str, Any]:
    """Async implementation of document sync"""
    documents_synced = 0
    documents_updated = 0
    errors = []

    async with PaperlessClient(**client_settings) as client:
        # Test connection first
        if broadcast_progress:
            await broadcast_task_status(
                task_id=task_id,
                status='processing',
                step='Testing connection to paperless-ngx',
                progress=0
            )

        await client.test_connection()

        # Get total document count
        stats = await client.get_statistics()
        total_documents = stats.get("documents_total", 0)

        if limit:
            total_documents = min(total_documents, limit)

        logger.info(f"Found {total_documents} documents in paperless-ngx")

        if broadcast_progress:
            await broadcast_task_status(
                task_id=task_id,
                status='processing',
                step=f'Syncing {total_documents} documents',
                progress=0,
                total=total_documents
            )

        # Get all document IDs from paperless
        all_documents = await client.get_all_documents(limit=limit)

        # Create mapping of existing documents
        existing_docs = {}
        if not force_refresh:
            for doc in db.query(Document).all():
                existing_docs[doc.paperless_id] = doc

        # Process each document
        for idx, doc_data in enumerate(all_documents):
            try:
                paperless_id = doc_data['id']

                # Update progress periodically
                if broadcast_progress and idx % 100 == 0:
                    await broadcast_task_status(
                        task_id=task_id,
                        status='processing',
                        step=f'Processing documents',
                        progress=idx + 1,
                        total=total_documents
                    )

                # Check if document needs update
                existing_doc = existing_docs.get(paperless_id)
                if existing_doc and not force_refresh:
                    # Check if document was modified
                    modified_date = parse_date_field(doc_data.get('modified'))
                    if modified_date and existing_doc.modified_date:
                        # Ensure both dates are timezone-aware for comparison
                        existing_date = existing_doc.modified_date
                        if existing_date.tzinfo is None:
                            existing_date = existing_date.replace(tzinfo=timezone.utc)
                        if modified_date <= existing_date:
                            continue  # Skip unchanged document

                # Get document content
                content_text = await client.get_document_content(paperless_id)

                if not content_text:
                    logger.warning(f"Document {paperless_id} has no content, skipping")
                    continue

                # Create or update document record
                if existing_doc:
                    document = existing_doc
                    documents_updated += 1
                else:
                    document = Document(paperless_id=paperless_id)
                    documents_synced += 1

                # Update document fields
                document.title = doc_data.get('title', '')[:500]
                document.fingerprint = doc_data.get('checksum', '')[:64]
                document.correspondent = doc_data.get('correspondent_name', '')[:200]
                document.document_type = doc_data.get('document_type_name', '')[:200]
                document.tags = [tag.get('name', '') for tag in doc_data.get('tags', [])]
                document.archive_filename = doc_data.get('archive_filename', '')[:500]
                document.original_filename = doc_data.get('original_filename', '')[:500]
                document.created_date = parse_date_field(doc_data.get('created'))
                document.added_date = parse_date_field(doc_data.get('added'))
                document.modified_date = parse_date_field(doc_data.get('modified'))
                document.processing_status = 'pending'
                document.last_processed = datetime.now(timezone.utc)

                if not existing_doc:
                    db.add(document)

                db.flush()

                # Store document content
                doc_content = db.query(DocumentContent).filter_by(
                    document_id=document.id
                ).first()

                if not doc_content:
                    doc_content = DocumentContent(
                        document_id=document.id
                    )

                # Truncate content if too long
                max_length = settings.max_ocr_length
                if len(content_text) > max_length:
                    content_text = content_text[:max_length]

                doc_content.full_text = content_text
                doc_content.word_count = len(content_text.split())

                if not doc_content.id:
                    db.add(doc_content)

                # Commit periodically
                if (idx + 1) % 50 == 0:
                    db.commit()

            except Exception as e:
                logger.error(f"Error syncing document {paperless_id}: {str(e)}")
                errors.append({
                    'document_id': paperless_id,
                    'error': str(e)
                })
                db.rollback()
                continue

        # Final commit
        db.commit()

    return {
        'documents_synced': documents_synced,
        'documents_updated': documents_updated,
        'total_documents': total_documents,
        'errors': errors,
        'status': 'completed' if len(errors) == 0 else 'completed_with_errors'
    }


class DocumentSyncTask(Task):
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
    base=DocumentSyncTask,
    bind=True,
    name='paperless_dedupe.worker.tasks.document_sync.sync_documents',
    max_retries=3,
    default_retry_delay=60
)
def sync_documents(
    self,
    force_refresh: bool = False,
    limit: int = None,
    broadcast_progress: bool = True
) -> dict[str, Any]:
    """
    Sync documents from paperless-ngx to local database.

    Args:
        force_refresh: Whether to refresh all documents
        limit: Limit number of documents to sync
        broadcast_progress: Whether to broadcast progress via WebSocket

    Returns:
        Dictionary with sync results
    """
    try:
        task_id = current_task.request.id
        start_time = datetime.now(timezone.utc)

        # Update task state
        self.update_state(
            state='PROGRESS',
            meta={
                'current_step': 'Initializing document sync',
                'progress': 0,
                'total': 0,
                'started_at': start_time.isoformat()
            }
        )

        # Broadcast initial status
        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='processing',
                step='Initializing document sync',
                progress=0,
                total=0
            ))

        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config
        client_settings = get_current_paperless_config(self.db)

        # Initialize client and sync documents
        result = asyncio.run(_sync_documents_async(
            self.db,
            client_settings,
            force_refresh,
            limit,
            broadcast_progress,
            task_id
        ))

        # Broadcast completion
        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=task_id,
                status='completed',
                step='Sync complete',
                result=result
            ))

        return result

    except SoftTimeLimitExceeded:
        logger.error(f"Task {current_task.request.id} exceeded time limit")
        self.db.rollback()
        raise

    except Exception as e:
        logger.error(f"Error in document sync task: {str(e)}", exc_info=True)
        self.db.rollback()

        # Broadcast error
        if broadcast_progress:
            asyncio.run(broadcast_task_status(
                task_id=current_task.request.id,
                status='failed',
                step='Sync failed',
                error=str(e)
            ))

        # Retry the task
        raise self.retry(exc=e)