import asyncio
import hashlib
import logging
import time
from datetime import UTC, date, datetime
from typing import Any

from celery import Task, current_task
from celery.exceptions import SoftTimeLimitExceeded
from dateutil import parser as date_parser
from opentelemetry import trace
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import AppConfig, Document, DocumentContent
from paperless_dedupe.services.deduplication_service import DeduplicationService
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


def metadata_has_changed(
    existing_doc: Document,
    correspondent_name: str | None,
    document_type_name: str | None,
    tags_list: list[str],
) -> bool:
    """Check if incoming metadata differs from the stored copy."""

    def normalize(value):
        return str(value).strip() if value is not None else ""

    existing_tags = sorted(
        normalize(tag) for tag in (existing_doc.tags or []) if normalize(tag)
    )
    incoming_tags = sorted(
        normalize(tag) for tag in (tags_list or []) if normalize(tag)
    )

    if existing_tags != incoming_tags:
        return True

    if normalize(existing_doc.correspondent) != normalize(correspondent_name):
        return True

    if normalize(existing_doc.document_type) != normalize(document_type_name):
        return True

    return False


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
    errors: list[dict[str, Any]] = []
    processed_documents = 0
    dedup_service = DeduplicationService()

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

            if not settings.fetch_metadata_on_sync:
                logger.info(
                    "Skipping per-document /metadata requests for faster sync; "
                    "file sizes may be empty. Set PAPERLESS_DEDUPE_FETCH_METADATA_ON_SYNC=true to re-enable."
                )

            last_broadcast_time = time.monotonic()
            last_broadcast_progress = 0

            async def process_batch(batch_docs: list[dict[str, Any]]):
                nonlocal documents_synced, documents_updated, processed_documents
                nonlocal last_broadcast_time, last_broadcast_progress, total_documents

                if not batch_docs:
                    return

                processed_documents += len(batch_docs)

                if broadcast_progress:
                    now = time.monotonic()
                    total_for_progress = total_documents or processed_documents
                    if (
                        processed_documents - last_broadcast_progress >= 200
                        or now - last_broadcast_time >= 1
                    ):
                        await broadcast_task_status(
                            task_id=task_id,
                            status="processing",
                            step="Processing documents",
                            progress=processed_documents,
                            total=total_for_progress,
                            started_at=started_at,
                            task_type="sync",
                        )
                        last_broadcast_time = now
                        last_broadcast_progress = processed_documents

                paperless_ids = [
                    doc.get("id") for doc in batch_docs if doc.get("id") is not None
                ]
                existing_docs: dict[int, Document] = {}
                existing_contents: dict[int, DocumentContent] = {}

                if paperless_ids:
                    existing_docs = {
                        doc.paperless_id: doc
                        for doc in db.query(Document)
                        .filter(Document.paperless_id.in_(paperless_ids))
                        .all()
                    }
                    if existing_docs:
                        content_rows = (
                            db.query(DocumentContent)
                            .filter(
                                DocumentContent.document_id.in_(
                                    [doc.id for doc in existing_docs.values()]
                                )
                            )
                            .all()
                        )
                        existing_contents = {
                            content.document_id: content for content in content_rows
                        }

                new_documents: list[Document] = []
                new_content_payloads: list[tuple[Document, str, str, int]] = []
                doc_update_mappings: list[dict[str, Any]] = []
                content_update_mappings: list[dict[str, Any]] = []
                content_inserts: list[DocumentContent] = []

                for doc_data in batch_docs:
                    paperless_id = doc_data.get("id")
                    if paperless_id is None:
                        logger.warning("Skipping document without id: %s", doc_data)
                        continue

                    try:
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

                        existing_doc = existing_docs.get(paperless_id)
                        doc_modified_date = parse_date_field(doc_data.get("modified"))
                        existing_modified_date = (
                            existing_doc.modified_date if existing_doc else None
                        )
                        if (
                            existing_modified_date
                            and existing_modified_date.tzinfo is None
                        ):
                            existing_modified_date = existing_modified_date.replace(
                                tzinfo=UTC
                            )

                        metadata_changed = (
                            metadata_has_changed(
                                existing_doc,
                                correspondent_name,
                                document_type_name,
                                tags_list,
                            )
                            if existing_doc
                            else False
                        )

                        if existing_doc and not force_refresh:
                            incoming_hash = doc_data.get("checksum") or doc_data.get(
                                "fingerprint"
                            )
                            incoming_hash = (
                                str(incoming_hash).strip()
                                if incoming_hash is not None
                                else None
                            )
                            hash_changed = (
                                bool(incoming_hash)
                                and existing_doc.content_hash
                                and incoming_hash != existing_doc.content_hash
                            )
                            if (
                                doc_modified_date
                                and existing_modified_date
                                and doc_modified_date <= existing_modified_date
                                and not metadata_changed
                                and not hash_changed
                            ):
                                continue

                        content_text: str | None = None
                        existing_content = (
                            existing_contents.get(existing_doc.id)
                            if existing_doc
                            else None
                        )
                        has_inline_content = (
                            "content" in doc_data
                            and doc_data.get("content") is not None
                        )
                        metadata_only_update = (
                            existing_doc
                            and metadata_changed
                            and not force_refresh
                            and doc_modified_date
                            and existing_modified_date
                            and doc_modified_date <= existing_modified_date
                        )

                        if has_inline_content:
                            content_text = doc_data.get("content") or ""
                        elif metadata_only_update and existing_content:
                            content_text = existing_content.full_text or ""
                        else:
                            content_text = await client.get_document_content(
                                paperless_id
                            )

                        original_size = doc_data.get("original_file_size")
                        archive_size = doc_data.get("archive_file_size")
                        meta = None
                        should_fetch_metadata = settings.fetch_metadata_on_sync and (
                            original_size is None or archive_size is None
                        )
                        if should_fetch_metadata:
                            try:
                                meta = await client.get_document_metadata(paperless_id)
                                original_size = original_size or meta.get(
                                    "original_size"
                                )
                                archive_size = archive_size or meta.get("archive_size")
                            except Exception as meta_err:
                                logger.warning(
                                    "Could not fetch metadata for document %s: %s",
                                    paperless_id,
                                    meta_err,
                                )

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

                        content_hash = doc_data.get("checksum") or doc_data.get(
                            "fingerprint"
                        )
                        if not content_hash and content_text:
                            content_hash = hashlib.sha256(
                                content_text.encode("utf-8")
                            ).hexdigest()

                        truncated_text = None
                        normalized_text = None
                        word_count = None
                        minhash_signature = None
                        minhash_computed = False

                        if content_text:
                            max_length = settings.max_ocr_length
                            truncated_text = (
                                content_text[:max_length]
                                if len(content_text) > max_length
                                else content_text
                            )
                            normalized_text = dedup_service.preprocess_text(
                                truncated_text
                            )
                            word_count = len(truncated_text.split())
                            minhash_computed = True
                            if word_count >= settings.min_ocr_word_count:
                                minhash = dedup_service.create_minhash(truncated_text)
                                minhash_signature = (
                                    dedup_service.serialize_minhash(minhash)
                                    if minhash
                                    else None
                                )

                        now = datetime.now(UTC)
                        document_payload: dict[str, Any] = {
                            "paperless_id": paperless_id,
                            "title": doc_data.get("title", "")[:500],
                            "fingerprint": fingerprint_value[:64],
                            "content_hash": content_hash,
                            "correspondent": (correspondent_name or "")[:200],
                            "document_type": (document_type_name or "")[:200],
                            "tags": tags_list,
                            "archive_filename": (
                                doc_data.get("archived_file_name")
                                or doc_data.get("archive_filename")
                                or (
                                    meta.get("archive_media_filename") if meta else None
                                )
                                or ""
                            )[:500],
                            "original_filename": (
                                doc_data.get("original_file_name")
                                or doc_data.get("original_filename")
                                or (meta.get("original_filename") if meta else None)
                                or ""
                            )[:500],
                            "original_file_size": original_size,
                            "archive_file_size": archive_size,
                            "created_date": parse_date_field(doc_data.get("created")),
                            "added_date": parse_date_field(doc_data.get("added")),
                            "modified_date": doc_modified_date,
                            "processing_status": "pending",
                            "last_processed": now,
                        }

                        if minhash_computed:
                            document_payload["minhash_signature"] = minhash_signature

                        if existing_doc:
                            documents_updated += 1
                            doc_update = {"id": existing_doc.id, **document_payload}
                            doc_update_mappings.append(doc_update)
                            doc_id = existing_doc.id
                        else:
                            document = Document(**document_payload)
                            new_documents.append(document)
                            documents_synced += 1
                            doc_id = None

                        if truncated_text:
                            content_payload = {
                                "full_text": truncated_text,
                                "normalized_text": normalized_text,
                                "word_count": word_count,
                            }
                            if doc_id is not None:
                                existing_content = existing_contents.get(doc_id)
                                if existing_content:
                                    content_update_mappings.append(
                                        {"id": existing_content.id, **content_payload}
                                    )
                                else:
                                    content_inserts.append(
                                        DocumentContent(
                                            document_id=doc_id, **content_payload
                                        )
                                    )
                            else:
                                new_content_payloads.append(
                                    (
                                        document,
                                        content_payload["full_text"],
                                        content_payload["normalized_text"],
                                        content_payload["word_count"],
                                    )
                                )
                        else:
                            logger.warning(
                                "Document %s has no OCR content; metadata stored only",
                                paperless_id,
                            )

                    except Exception as e:
                        trace.get_current_span().record_exception(e)
                        logger.error(
                            f"Error syncing document {paperless_id}: {str(e)}",
                            exc_info=True,
                        )
                        errors.append({"document_id": paperless_id, "error": str(e)})
                        continue

                try:
                    if new_documents:
                        db.bulk_save_objects(new_documents, return_defaults=True)

                    if doc_update_mappings:
                        db.bulk_update_mappings(Document, doc_update_mappings)

                    if new_documents and new_content_payloads:
                        for (
                            doc,
                            full_text,
                            normalized_text,
                            word_count,
                        ) in new_content_payloads:
                            content_inserts.append(
                                DocumentContent(
                                    document_id=doc.id,
                                    full_text=full_text,
                                    normalized_text=normalized_text,
                                    word_count=word_count,
                                )
                            )

                    if content_update_mappings:
                        db.bulk_update_mappings(
                            DocumentContent, content_update_mappings
                        )

                    if content_inserts:
                        db.bulk_save_objects(content_inserts)

                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"Batch commit failed: {str(e)}", exc_info=True)
                    errors.append({"batch_error": str(e)})

            # Stream documents in batches without holding full list in memory
            with tracer.start_as_current_span(
                "paperless.fetch_documents", attributes={"paperless.limit": limit or 0}
            ):
                await client.get_all_documents(
                    limit=limit, batch_callback=process_batch, return_documents=False
                )

            if total_documents == 0:
                total_documents = processed_documents

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
            sync_span.set_attribute("paperless.documents.total", processed_documents)
            sync_span.set_attribute("paperless.documents.errors", len(errors))

    return {
        "documents_synced": documents_synced,
        "documents_updated": documents_updated,
        "total_documents": processed_documents,
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
        raise self.retry(exc=e) from e
