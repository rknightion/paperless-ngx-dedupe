import asyncio
import hashlib
import logging
from datetime import UTC, date, datetime
from typing import Any

from celery import Task, current_task
from celery.exceptions import SoftTimeLimitExceeded
from dateutil import parser as date_parser
from opentelemetry import trace
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import AppConfig, Document, DocumentContent
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.database import get_worker_session
from paperless_dedupe.worker.utils import broadcast_task_status

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


def parse_date_field(date_value):
    """Parse date field from various formats to Python datetime"""
    if date_value is None:
        return None
    if isinstance(date_value, datetime):
        # If datetime but naive, make it UTC-aware
        if date_value.tzinfo is None:
            return date_value.replace(tzinfo=UTC)
        return date_value
    if isinstance(date_value, str):
        try:
            parsed = date_parser.parse(date_value)
            # If parsed datetime is naive, make it UTC-aware
            if parsed and parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed
        except (ValueError, TypeError):
            return None
    if isinstance(date_value, date):
        # Preserve the date while making it timezone-aware at midnight
        return datetime.combine(date_value, datetime.min.time(), tzinfo=UTC)
    return None


async def _sync_documents_async(
    db: Session,
    client_settings: dict,
    force_refresh: bool,
    limit: int,
    broadcast_progress: bool,
    task_id: str,
    started_at: datetime,
) -> dict[str, Any]:
    """Async implementation of document sync"""
    documents_synced = 0
    documents_updated = 0
    errors = []

    with tracer.start_as_current_span(
        "paperless.sync_documents",
        attributes={
            "paperless.force_refresh": force_refresh,
            "paperless.limit": limit or 0,
            "paperless.broadcast": broadcast_progress,
        },
    ):
        async with PaperlessClient(**client_settings) as client:
            # Test connection first
            if broadcast_progress:
                await broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step="Testing connection to paperless-ngx",
                    progress=0,
                    started_at=started_at,
                    task_type="sync",
                )

            with tracer.start_as_current_span("paperless.test_connection"):
                await client.test_connection()

            # Get total document count (fallback to actual fetched count below)
            with tracer.start_as_current_span("paperless.fetch_statistics"):
                stats = await client.get_statistics()
            total_documents = (
                stats.get("total_documents") or stats.get("documents_total") or 0
            )

            if limit:
                total_documents = min(total_documents, limit)

            logger.info(f"Found {total_documents} documents in paperless-ngx")

            if broadcast_progress:
                await broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step=f"Syncing {total_documents} documents",
                    progress=0,
                    total=total_documents,
                    started_at=started_at,
                    task_type="sync",
                )

            # Preload reference data for better metadata mapping
            tag_map: dict[str, str] = {}
            correspondent_map: dict[str, str] = {}
            document_type_map: dict[str, str] = {}

            try:
                with tracer.start_as_current_span("paperless.preload.tags"):
                    tag_map = {
                        str(tag["id"]): tag.get("name", "")
                        for tag in await client.get_tags()
                        if tag.get("id") is not None
                    }
            except Exception as e:
                logger.warning(f"Could not preload tags: {e}")

            try:
                with tracer.start_as_current_span("paperless.preload.correspondents"):
                    correspondent_map = {
                        str(c["id"]): c.get("name", "")
                        for c in await client.get_correspondents()
                        if c.get("id") is not None
                    }
            except Exception as e:
                logger.warning(f"Could not preload correspondents: {e}")

            try:
                with tracer.start_as_current_span("paperless.preload.document_types"):
                    document_type_map = {
                        str(dt["id"]): dt.get("name", "")
                        for dt in await client.get_document_types()
                        if dt.get("id") is not None
                    }
            except Exception as e:
                logger.warning(f"Could not preload document types: {e}")

            # Get all document IDs from paperless
            with tracer.start_as_current_span(
                "paperless.fetch_documents", attributes={"paperless.limit": limit or 0}
            ) as fetch_span:
                all_documents = await client.get_all_documents(limit=limit)
                fetch_span.set_attribute(
                    "paperless.documents.count", len(all_documents)
                )

            total_documents = len(all_documents)

            # Create mapping of existing documents
            existing_docs = {doc.paperless_id: doc for doc in db.query(Document).all()}

            if not settings.fetch_metadata_on_sync:
                logger.info(
                    "Skipping per-document /metadata requests for faster sync; "
                    "file sizes may be empty. Set PAPERLESS_DEDUPE_FETCH_METADATA_ON_SYNC=true to re-enable."
                )

            # Align broadcast total with actual documents fetched
            if broadcast_progress:
                await broadcast_task_status(
                    task_id=task_id,
                    status="processing",
                    step=f"Syncing {total_documents} documents",
                    progress=0,
                    total=total_documents,
                    started_at=started_at,
                    task_type="sync",
                )

            # Process each document
            for idx, doc_data in enumerate(all_documents):
                try:
                    paperless_id = doc_data.get("id")
                    if paperless_id is None:
                        logger.warning("Skipping document without id: %s", doc_data)
                        continue

                    # Update progress periodically
                    if broadcast_progress and idx % 100 == 0:
                        await broadcast_task_status(
                            task_id=task_id,
                            status="processing",
                            step="Processing documents",
                            progress=idx + 1,
                            total=total_documents,
                            started_at=started_at,
                            task_type="sync",
                        )

                    # Check if document needs update
                    existing_doc = existing_docs.get(paperless_id)
                    if existing_doc and not force_refresh:
                        # Check if document was modified
                        modified_date = parse_date_field(doc_data.get("modified"))
                        if modified_date and existing_doc.modified_date:
                            # Ensure both dates are timezone-aware for comparison
                            existing_date = existing_doc.modified_date
                            if existing_date.tzinfo is None:
                                existing_date = existing_date.replace(tzinfo=UTC)
                            if modified_date <= existing_date:
                                continue  # Skip unchanged document

                    # Resolve metadata names
                    correspondent_name = doc_data.get("correspondent_name")
                    if (
                        not correspondent_name
                        and doc_data.get("correspondent") is not None
                        and correspondent_map
                    ):
                        correspondent_name = correspondent_map.get(
                            str(doc_data.get("correspondent"))
                        ) or correspondent_map.get(doc_data.get("correspondent"))

                    document_type_name = doc_data.get("document_type_name")
                    if (
                        not document_type_name
                        and doc_data.get("document_type") is not None
                        and document_type_map
                    ):
                        document_type_name = document_type_map.get(
                            str(doc_data.get("document_type"))
                        ) or document_type_map.get(doc_data.get("document_type"))

                    # Resolve tag names, supporting both IDs and objects
                    tags_list: list[str] = []
                    tags_data = doc_data.get("tags") or []
                    for tag in tags_data:
                        name = None
                        tag_id = None
                        if isinstance(tag, dict):
                            name = tag.get("name") or tag.get("label")
                            tag_id = tag.get("id")
                        else:
                            tag_id = tag

                        if name:
                            tags_list.append(name)
                        elif tag_id is not None:
                            mapped = tag_map.get(str(tag_id)) or tag_map.get(tag_id)
                            tags_list.append(mapped or str(tag_id))

                    # Fetch document content (reuse if already provided)
                    if "content" in doc_data and doc_data.get("content") is not None:
                        content_text = doc_data.get("content") or ""
                    else:
                        content_text = await client.get_document_content(paperless_id)

                    original_size = doc_data.get("original_file_size")
                    archive_size = doc_data.get("archive_file_size")
                    meta = None
                    should_fetch_metadata = settings.fetch_metadata_on_sync and (
                        original_size is None or archive_size is None
                    )
                    if should_fetch_metadata:
                        try:
                            meta = await client.get_document_metadata(paperless_id)
                            original_size = original_size or meta.get("original_size")
                            archive_size = archive_size or meta.get("archive_size")
                        except Exception as meta_err:
                            logger.warning(
                                "Could not fetch metadata for document %s: %s",
                                paperless_id,
                                meta_err,
                            )

                    # Create or update document record
                    if existing_doc:
                        document = existing_doc
                        documents_updated += 1
                    else:
                        document = Document(paperless_id=paperless_id)
                        documents_synced += 1

                    # Update document fields
                    document.title = doc_data.get("title", "")[:500]

                    fingerprint_raw = doc_data.get("checksum") or doc_data.get(
                        "fingerprint"
                    )
                    fingerprint_value = (
                        str(fingerprint_raw).strip()
                        if fingerprint_raw is not None
                        else ""
                    )
                    if not fingerprint_value:
                        fingerprint_value = f"paperless-{paperless_id}"
                    document.fingerprint = fingerprint_value[:64]

                    content_hash = doc_data.get("checksum") or doc_data.get(
                        "fingerprint"
                    )
                    if not content_hash and content_text:
                        content_hash = hashlib.sha256(
                            content_text.encode("utf-8")
                        ).hexdigest()
                    document.content_hash = content_hash

                    document.correspondent = (correspondent_name or "")[:200]
                    document.document_type = (document_type_name or "")[:200]
                    document.tags = tags_list
                    document.archive_filename = (
                        doc_data.get("archived_file_name")
                        or doc_data.get("archive_filename")
                        or (meta.get("archive_media_filename") if meta else None)
                        or ""
                    )[:500]
                    document.original_filename = (
                        doc_data.get("original_file_name")
                        or doc_data.get("original_filename")
                        or (meta.get("original_filename") if meta else None)
                        or ""
                    )[:500]
                    document.original_file_size = original_size
                    document.archive_file_size = archive_size
                    document.created_date = parse_date_field(doc_data.get("created"))
                    document.added_date = parse_date_field(doc_data.get("added"))
                    document.modified_date = parse_date_field(doc_data.get("modified"))
                    document.processing_status = "pending"
                    document.last_processed = datetime.now(UTC)

                    if not existing_doc:
                        db.add(document)

                    db.flush()

                    # Store document content when available
                    if content_text:
                        doc_content = (
                            db.query(DocumentContent)
                            .filter_by(document_id=document.id)
                            .first()
                        )

                        if not doc_content:
                            doc_content = DocumentContent(document_id=document.id)

                        # Truncate content if too long
                        max_length = settings.max_ocr_length
                        if len(content_text) > max_length:
                            content_text = content_text[:max_length]

                        doc_content.full_text = content_text
                        doc_content.word_count = len(content_text.split())

                        if not doc_content.id:
                            db.add(doc_content)
                    else:
                        logger.warning(
                            "Document %s has no OCR content; metadata stored only",
                            paperless_id,
                        )

                    # Commit periodically
                    if (idx + 1) % 100 == 0:
                        db.commit()

                except Exception as e:
                    trace.get_current_span().record_exception(e)
                    logger.error(
                        f"Error syncing document {paperless_id}: {str(e)}",
                        exc_info=True,
                    )
                    errors.append({"document_id": paperless_id, "error": str(e)})
                    db.rollback()
                    continue

            # Final commit
            db.commit()

            # Cache latest Paperless statistics for the dashboard
            try:
                if stats:
                    import json

                    with tracer.start_as_current_span("paperless.cache_statistics"):
                        stats_config = (
                            db.query(AppConfig)
                            .filter(AppConfig.key == "paperless_stats")
                            .first()
                        )
                        serialized_stats = json.dumps(stats)
                        if stats_config:
                            stats_config.value = serialized_stats
                        else:
                            stats_config = AppConfig(
                                key="paperless_stats", value=serialized_stats
                            )
                            db.add(stats_config)

                        stats_time_config = (
                            db.query(AppConfig)
                            .filter(AppConfig.key == "paperless_stats_updated")
                            .first()
                        )
                        timestamp = datetime.now(UTC).isoformat()
                        if stats_time_config:
                            stats_time_config.value = timestamp
                        else:
                            stats_time_config = AppConfig(
                                key="paperless_stats_updated", value=timestamp
                            )
                            db.add(stats_time_config)

                        db.commit()
            except Exception as e:
                logger.warning(f"Could not cache Paperless statistics after sync: {e}")

            sync_span = trace.get_current_span()
            sync_span.set_attribute("paperless.documents.synced", documents_synced)
            sync_span.set_attribute("paperless.documents.updated", documents_updated)
            sync_span.set_attribute("paperless.documents.total", total_documents)
            sync_span.set_attribute("paperless.documents.errors", len(errors))

    return {
        "documents_synced": documents_synced,
        "documents_updated": documents_updated,
        "total_documents": total_documents,
        "errors": errors,
        "status": "completed" if len(errors) == 0 else "completed_with_errors",
    }


class DocumentSyncTask(Task):
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
    base=DocumentSyncTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.document_sync.sync_documents",
    max_retries=3,
    default_retry_delay=60,
)
def sync_documents(
    self,
    force_refresh: bool = False,
    limit: int = None,
    broadcast_progress: bool = True,
) -> dict[str, Any]:
    """Sync documents from paperless-ngx to local database.

    Args:
        force_refresh: Whether to refresh all documents
        limit: Limit number of documents to sync
        broadcast_progress: Whether to broadcast progress via WebSocket

    Returns:
        Dictionary with sync results
    """
    try:
        task_id = current_task.request.id
        start_time = datetime.now(UTC)

        with tracer.start_as_current_span(
            "paperless.sync_documents.task",
            attributes={
                "celery.task_id": task_id,
                "paperless.force_refresh": force_refresh,
                "paperless.limit": limit or 0,
            },
        ):
            # Update task state
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Initializing document sync",
                    "progress": 0,
                    "total": 0,
                    "started_at": start_time.isoformat(),
                },
            )

            # Broadcast initial status
            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step="Initializing document sync",
                        progress=0,
                        total=0,
                        started_at=start_time,
                        task_type="sync",
                    )
                )

            # Get current config from database
            from paperless_dedupe.core.config_utils import get_current_paperless_config

            client_settings = get_current_paperless_config(self.db)

            # Initialize client and sync documents
            result = asyncio.run(
                _sync_documents_async(
                    self.db,
                    client_settings,
                    force_refresh,
                    limit,
                    broadcast_progress,
                    task_id,
                    start_time,
                )
            )

            completed_at = datetime.now(UTC)
            result["started_at"] = start_time.isoformat()
            result["completed_at"] = completed_at.isoformat()

            # Broadcast completion
            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="completed",
                        step="Sync complete",
                        progress=result.get(
                            "total_documents", result.get("documents_synced", 0)
                        ),
                        total=result.get(
                            "total_documents", result.get("documents_synced", 0)
                        ),
                        result=result,
                        started_at=start_time,
                        completed_at=completed_at,
                        task_type="sync",
                    )
                )

            return result

    except SoftTimeLimitExceeded:
        logger.error(f"Task {current_task.request.id} exceeded time limit")
        self.db.rollback()
        raise

    except Exception as e:
        trace.get_current_span().record_exception(e)
        logger.error(f"Error in document sync task: {str(e)}", exc_info=True)
        self.db.rollback()

        # Broadcast error
        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=current_task.request.id,
                    status="failed",
                    step="Sync failed",
                    error=str(e),
                    started_at=start_time,
                    task_type="sync",
                )
            )

        # Retry the task
        raise self.retry(exc=e)
