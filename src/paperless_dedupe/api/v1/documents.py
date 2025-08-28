import asyncio
import logging
from datetime import datetime

from dateutil import parser as date_parser
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import Document, DocumentContent, get_db
from paperless_dedupe.services.paperless_client import PaperlessClient

from .websocket import broadcast_error, broadcast_sync_completion, broadcast_sync_update

logger = logging.getLogger(__name__)
router = APIRouter()


def parse_date_field(date_value):
    """Parse date field from various formats to Python datetime"""
    if date_value is None:
        return None
    if isinstance(date_value, datetime):
        return date_value
    if isinstance(date_value, str):
        try:
            # Try to parse ISO format or other common formats
            return date_parser.parse(date_value)
        except (ValueError, TypeError):
            return None
    return None


# Global sync status
sync_status = {
    "is_syncing": False,
    "current_step": "",
    "progress": 0,
    "total": 0,
    "started_at": None,
    "completed_at": None,
    "error": None,
    "documents_synced": 0,
    "documents_updated": 0,
}


async def safe_broadcast_sync_update():
    """Safely broadcast sync status update via WebSocket"""
    try:
        await broadcast_sync_update(sync_status.copy())
    except Exception as e:
        logger.error(f"Error broadcasting sync WebSocket update: {e}")


class DocumentResponse(BaseModel):
    id: int
    paperless_id: int
    title: str | None
    file_size: int | None
    processing_status: str
    has_duplicates: bool = False
    created_date: datetime | None = None
    last_processed: datetime | None = None

    class Config:
        from_attributes = True
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class DocumentListResponse(BaseModel):
    results: list[DocumentResponse]
    count: int
    next: str | None = None
    previous: str | None = None


class DocumentSync(BaseModel):
    force_refresh: bool = False
    limit: int | None = None


@router.get("/", response_model=DocumentListResponse)
async def get_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get list of documents"""
    # Get total count
    total_count = db.query(Document).count()

    # Get paginated documents
    documents = db.query(Document).offset(skip).limit(limit).all()

    # Check if documents have duplicates
    results = []
    for doc in documents:
        doc_response = DocumentResponse.from_orm(doc)
        doc_response.has_duplicates = len(doc.duplicate_memberships) > 0
        results.append(doc_response)

    # Create pagination URLs (simplified for now)
    next_url = None
    previous_url = None
    if skip + limit < total_count:
        next_url = f"?skip={skip + limit}&limit={limit}"
    if skip > 0:
        previous_url = f"?skip={max(0, skip - limit)}&limit={limit}"

    return DocumentListResponse(
        results=results, count=total_count, next=next_url, previous=previous_url
    )


@router.get("/statistics")
async def get_document_statistics(db: Session = Depends(get_db)):
    """Get comprehensive document statistics including Paperless metadata"""
    logger.info("Getting document statistics")

    # Get basic counts from local database
    total_documents = db.query(Document).count()
    logger.debug(f"Total documents: {total_documents}")

    # Get processing status counts
    processing_status = {
        "pending": db.query(Document)
        .filter(Document.processing_status == "pending")
        .count(),
        "processing": db.query(Document)
        .filter(Document.processing_status == "processing")
        .count(),
        "completed": db.query(Document)
        .filter(Document.processing_status == "completed")
        .count(),
        "error": db.query(Document)
        .filter(Document.processing_status == "error")
        .count(),
    }

    # Get OCR statistics
    documents_with_ocr = (
        db.query(Document)
        .join(DocumentContent)
        .filter(
            DocumentContent.full_text != None,
            func.length(DocumentContent.full_text) > 0,
        )
        .count()
    )

    documents_without_ocr = total_documents - documents_with_ocr

    # Calculate average OCR length
    avg_ocr_length = (
        db.query(func.avg(func.length(DocumentContent.full_text))).scalar() or 0
    )

    # Get total size (if stored)
    total_size = db.query(func.sum(Document.file_size)).scalar() or 0

    # Size distribution (simplified since file_size might not be populated)
    small_docs = (
        db.query(Document).filter(Document.file_size < 100 * 1024).count()
        if total_size > 0
        else 0
    )
    medium_docs = (
        db.query(Document)
        .filter(Document.file_size >= 100 * 1024, Document.file_size < 1024 * 1024)
        .count()
        if total_size > 0
        else 0
    )
    large_docs = (
        db.query(Document)
        .filter(
            Document.file_size >= 1024 * 1024, Document.file_size < 10 * 1024 * 1024
        )
        .count()
        if total_size > 0
        else 0
    )
    xlarge_docs = (
        db.query(Document).filter(Document.file_size >= 10 * 1024 * 1024).count()
        if total_size > 0
        else 0
    )

    size_distribution = {
        "small": small_docs,
        "medium": medium_docs,
        "large": large_docs,
        "xlarge": xlarge_docs,
    }

    # Sync status - use last_processed field
    last_sync = db.query(func.max(Document.last_processed)).scalar()

    # Get cached Paperless statistics from database (updated during sync)
    # We don't fetch live from API as it's too slow (20+ seconds)
    paperless_stats = {}
    try:
        from paperless_dedupe.models.database import AppConfig

        stats_config = (
            db.query(AppConfig).filter(AppConfig.key == "paperless_stats").first()
        )
        if stats_config and stats_config.value:
            import json

            paperless_stats = json.loads(stats_config.value)
    except Exception as e:
        logger.warning(f"Could not load cached Paperless statistics: {e}")

    return {
        "total_documents": total_documents,
        "total_size": total_size,
        "processed_count": processing_status["completed"],
        "pending_count": processing_status["pending"],
        "error_count": processing_status["error"],
        "average_ocr_length": int(avg_ocr_length),
        "documents_with_ocr": documents_with_ocr,
        "documents_without_ocr": documents_without_ocr,
        "size_distribution": size_distribution,
        "processing_status": processing_status,
        "sync_status": {
            "last_sync": last_sync.isoformat() if last_sync else None,
            "documents_synced": total_documents,
            "sync_in_progress": sync_status.get("is_syncing", False),
        },
        # New Paperless statistics
        "paperless_stats": paperless_stats,
    }


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int, db: Session = Depends(get_db)):
    """Get single document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    doc_response = DocumentResponse.from_orm(document)
    doc_response.has_duplicates = len(document.duplicate_memberships) > 0
    return doc_response


@router.get("/{document_id}/content")
async def get_document_content(document_id: int, db: Session = Depends(get_db)):
    """Get document OCR content"""
    # Get from database
    content = (
        db.query(DocumentContent)
        .filter(DocumentContent.document_id == document_id)
        .first()
    )

    if not content:
        raise HTTPException(status_code=404, detail="Document content not found")

    return {"content": content.full_text}


@router.get("/{document_id}/duplicates")
async def get_document_duplicates(document_id: int, db: Session = Depends(get_db)):
    """Get duplicates for a specific document"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    duplicates = []
    for membership in document.duplicate_memberships:
        group = membership.group
        for member in group.members:
            if member.document_id != document_id:
                duplicates.append(
                    {
                        "document_id": member.document.id,
                        "paperless_id": member.document.paperless_id,
                        "title": member.document.title,
                        "confidence": group.confidence_score,
                        "group_id": group.id,
                    }
                )

    return {"document_id": document_id, "duplicates": duplicates}


async def run_document_sync(
    db: Session, force_refresh: bool = False, limit: int | None = None
):
    """Background task to sync documents from paperless-ngx"""
    global sync_status

    try:
        sync_status["is_syncing"] = True
        sync_status["current_step"] = "Connecting to Paperless"
        sync_status["started_at"] = datetime.utcnow()
        sync_status["error"] = None
        sync_status["documents_synced"] = 0
        sync_status["documents_updated"] = 0

        await safe_broadcast_sync_update()

        # If force refresh, clean up all existing data first
        if force_refresh:
            sync_status["current_step"] = "Clearing existing data for fresh sync"
            await safe_broadcast_sync_update()

            from paperless_dedupe.models.database import DuplicateGroup, DuplicateMember

            # Delete all duplicate analysis results
            deleted_members = db.query(DuplicateMember).delete()
            deleted_groups = db.query(DuplicateGroup).delete()

            # Delete all document content
            deleted_content = db.query(DocumentContent).delete()

            # Delete all documents
            deleted_docs = db.query(Document).delete()

            db.commit()

            logger.info(
                f"Force refresh cleanup: Deleted {deleted_docs} documents, "
                f"{deleted_content} content records, {deleted_groups} duplicate groups, "
                f"{deleted_members} duplicate members"
            )

            # Small delay after cleanup
            await asyncio.sleep(0.1)

        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config

        client_settings = get_current_paperless_config(db)

        async with PaperlessClient(**client_settings) as client:
            # Test connection first
            if not await client.test_connection():
                raise Exception("Cannot connect to paperless-ngx API")

            # First fetch all tags to build ID->name mapping
            sync_status["current_step"] = "Fetching tags"
            await safe_broadcast_sync_update()

            tags_list = await client.get_tags()
            # Create mappings for both int and string keys to handle both cases
            tag_id_to_name = {}
            for tag in tags_list:
                tag_id = tag["id"]
                tag_name = tag["name"]
                tag_id_to_name[tag_id] = (
                    tag_name  # Store with original type (likely int)
                )
                tag_id_to_name[str(tag_id)] = tag_name  # Also store as string
            logger.info(f"Fetched {len(tags_list)} tags from paperless-ngx")

            # Get all documents from paperless
            sync_status["current_step"] = "Fetching document list"
            await safe_broadcast_sync_update()

            logger.info("Starting document sync from paperless-ngx")
            import time

            start_time = time.time()

            # Define callback to track progress during fetch
            last_fetch_broadcast = time.time()

            async def batch_progress_callback(batch):
                nonlocal last_fetch_broadcast
                sync_status["documents_synced"] += len(batch)
                current_time = time.time()

                # Broadcast every second during fetch
                if current_time - last_fetch_broadcast >= 1:
                    elapsed = current_time - start_time
                    rate = (
                        sync_status["documents_synced"] / elapsed if elapsed > 0 else 0
                    )
                    logger.info(
                        f"Fetched {sync_status['documents_synced']} documents ({rate:.1f} docs/sec)"
                    )
                    sync_status["current_step"] = (
                        f"Fetching documents... ({sync_status['documents_synced']} so far)"
                    )
                    await safe_broadcast_sync_update()
                    last_fetch_broadcast = current_time

            # Reset counter for accurate tracking during fetch
            sync_status["documents_synced"] = 0
            paperless_docs = await client.get_all_documents(
                batch_callback=batch_progress_callback
            )

            fetch_time = time.time() - start_time
            logger.info(
                f"Document list fetched in {fetch_time:.2f} seconds ({len(paperless_docs)}/{fetch_time:.1f} = {len(paperless_docs) / fetch_time:.1f} docs/sec)"
            )

            if limit:
                paperless_docs = paperless_docs[:limit]

            sync_status["total"] = len(paperless_docs)
            sync_status["current_step"] = f"Syncing {len(paperless_docs)} documents"
            await safe_broadcast_sync_update()

            # Sync to database
            synced_count = 0
            updated_count = 0
            last_broadcast_time = time.time()
            last_progress = 0

            for idx, pdoc in enumerate(paperless_docs):
                sync_status["progress"] = idx + 1
                current_time = time.time()

                # Calculate progress percentage
                current_progress = int((idx + 1) / len(paperless_docs) * 100)

                # Broadcast if:
                # - 1 second has passed since last update
                # - Progress increased by 5% or more
                # - It's the first or last document
                time_elapsed = current_time - last_broadcast_time >= 1
                progress_jump = current_progress - last_progress >= 5
                is_first = idx == 0
                is_last = idx == len(paperless_docs) - 1

                if time_elapsed or progress_jump or is_first or is_last:
                    sync_status["documents_synced"] = synced_count
                    sync_status["documents_updated"] = updated_count
                    await safe_broadcast_sync_update()
                    last_broadcast_time = current_time
                    last_progress = current_progress

                # Check if document exists
                existing = (
                    db.query(Document)
                    .filter(Document.paperless_id == pdoc["id"])
                    .first()
                )

                if existing and not force_refresh:
                    # Skip if document exists and we're not forcing refresh
                    updated_count += 1
                    continue

                # Process tags - they might be IDs or objects
                tags_list = []
                tags_data = pdoc.get("tags", [])
                if tags_data:
                    for tag in tags_data:
                        if isinstance(tag, dict):
                            # Tag is an object with name
                            tags_list.append(tag.get("name", str(tag.get("id", ""))))
                        else:
                            # Tag is just an ID, look up the name
                            tag_name = tag_id_to_name.get(tag, f"tag-{tag}")
                            tags_list.append(tag_name)

                if existing:
                    # Update existing document
                    existing.title = pdoc.get("title", "")
                    existing.file_size = pdoc.get("original_file_size")
                    existing.created_date = parse_date_field(pdoc.get("created"))
                    existing.correspondent = pdoc.get("correspondent_name")
                    existing.document_type = pdoc.get("document_type_name")
                    existing.tags = tags_list
                    existing.archive_filename = pdoc.get("archive_filename")
                    existing.original_filename = pdoc.get("original_filename")
                    existing.added_date = parse_date_field(pdoc.get("added"))
                    existing.modified_date = parse_date_field(pdoc.get("modified"))
                    updated_count += 1
                else:
                    # Create new document
                    document = Document(
                        paperless_id=pdoc["id"],
                        title=pdoc.get("title", ""),
                        file_size=pdoc.get("original_file_size"),
                        created_date=parse_date_field(pdoc.get("created")),
                        correspondent=pdoc.get("correspondent_name"),
                        document_type=pdoc.get("document_type_name"),
                        tags=tags_list,
                        archive_filename=pdoc.get("archive_filename"),
                        original_filename=pdoc.get("original_filename"),
                        added_date=parse_date_field(pdoc.get("added")),
                        modified_date=parse_date_field(pdoc.get("modified")),
                        processing_status="pending",
                    )
                    db.add(document)
                    db.flush()  # Get the ID for the document
                    synced_count += 1

                # Get and store OCR content (up to 500K characters)
                content_text = pdoc.get("content", "")
                if content_text:
                    # Remove existing content if updating
                    if existing:
                        db.query(DocumentContent).filter(
                            DocumentContent.document_id == existing.id
                        ).delete()

                    # Store full text up to max_ocr_length (500K)
                    # No longer truncating based on user config - always use full 500K limit
                    truncated_text = (
                        content_text[: settings.max_ocr_length]
                        if len(content_text) > settings.max_ocr_length
                        else content_text
                    )

                    # Add new content
                    content = DocumentContent(
                        document_id=document.id if not existing else existing.id,
                        full_text=truncated_text,
                        word_count=len(truncated_text.split()),
                        normalized_text=None,  # Can be used for preprocessed text later
                    )
                    db.add(content)

                # Commit in batches to avoid holding transaction too long
                # Increased batch size from 100 to 200 for better performance
                if (idx + 1) % 200 == 0:
                    db.commit()
                    logger.debug(f"Committed batch at document {idx + 1}")

            # Final commit
            db.commit()

            # After sync, update Paperless statistics in database
            sync_status["current_step"] = "Updating statistics"
            await safe_broadcast_sync_update()

            try:
                logger.info("Fetching and caching Paperless statistics...")
                paperless_stats = await client.get_statistics()

                if paperless_stats:
                    # Store stats in database as JSON
                    import json

                    from paperless_dedupe.models.database import AppConfig

                    stats_config = (
                        db.query(AppConfig)
                        .filter(AppConfig.key == "paperless_stats")
                        .first()
                    )
                    if stats_config:
                        stats_config.value = json.dumps(paperless_stats)
                    else:
                        stats_config = AppConfig(
                            key="paperless_stats", value=json.dumps(paperless_stats)
                        )
                        db.add(stats_config)

                    # Also store last update time
                    stats_time_config = (
                        db.query(AppConfig)
                        .filter(AppConfig.key == "paperless_stats_updated")
                        .first()
                    )
                    if stats_time_config:
                        stats_time_config.value = datetime.utcnow().isoformat()
                    else:
                        stats_time_config = AppConfig(
                            key="paperless_stats_updated",
                            value=datetime.utcnow().isoformat(),
                        )
                        db.add(stats_time_config)

                    db.commit()
                    logger.info("Paperless statistics cached successfully")
            except Exception as e:
                logger.warning(f"Could not cache Paperless statistics: {e}")

            sync_status["documents_synced"] = synced_count
            sync_status["documents_updated"] = updated_count
            sync_status["current_step"] = "Completed"
            sync_status["completed_at"] = datetime.utcnow()
            sync_status["progress"] = sync_status["total"]

            await safe_broadcast_sync_update()

            # Broadcast completion
            try:
                await broadcast_sync_completion(
                    {
                        "total_documents": len(paperless_docs),
                        "new_documents": synced_count,
                        "updated_documents": updated_count,
                        "completed_at": sync_status["completed_at"].isoformat(),
                    }
                )
            except Exception as e:
                logger.error(f"Error broadcasting sync completion: {e}")

            total_sync_time = (
                datetime.utcnow() - sync_status["started_at"]
            ).total_seconds()
            docs_per_sec = (
                len(paperless_docs) / total_sync_time if total_sync_time > 0 else 0
            )

            logger.info(
                f"Document sync completed. Synced: {synced_count}, Updated: {updated_count}, "
                f"Total time: {total_sync_time:.2f}s ({docs_per_sec:.1f} docs/sec)"
            )

    except Exception as e:
        logger.error(f"Error during document sync: {e}")
        sync_status["error"] = str(e)
        sync_status["current_step"] = "Error"

        try:
            await safe_broadcast_sync_update()
            await broadcast_error(f"Sync failed: {str(e)}")
        except Exception as broadcast_exc:
            logger.error(f"Error broadcasting sync error: {broadcast_exc}")
    finally:
        sync_status["is_syncing"] = False


@router.post("/sync")
async def sync_documents(
    sync_config: DocumentSync,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Sync documents from paperless-ngx"""
    global sync_status

    if sync_status["is_syncing"]:
        raise HTTPException(status_code=409, detail="Sync already in progress")

    # Check if analysis is in progress
    from paperless_dedupe.api.v1.processing import processing_status

    if processing_status.get("is_processing", False):
        raise HTTPException(
            status_code=409,
            detail="Cannot sync while deduplication analysis is in progress",
        )

    # Start background task
    background_tasks.add_task(
        run_document_sync, db, sync_config.force_refresh, sync_config.limit
    )

    return {"status": "started", "message": "Document sync started in background"}


@router.post("/statistics/refresh")
async def refresh_statistics(db: Session = Depends(get_db)):
    """Manually refresh Paperless statistics cache"""
    try:
        import json

        from paperless_dedupe.core.config_utils import get_current_paperless_config
        from paperless_dedupe.models.database import AppConfig

        client_settings = get_current_paperless_config(db)
        if not client_settings:
            raise HTTPException(
                status_code=400, detail="Paperless connection not configured"
            )

        async with PaperlessClient(**client_settings) as client:
            logger.info("Manually refreshing Paperless statistics...")
            paperless_stats = await client.get_statistics()

            if paperless_stats:
                # Store stats in database as JSON
                stats_config = (
                    db.query(AppConfig)
                    .filter(AppConfig.key == "paperless_stats")
                    .first()
                )
                if stats_config:
                    stats_config.value = json.dumps(paperless_stats)
                else:
                    stats_config = AppConfig(
                        key="paperless_stats", value=json.dumps(paperless_stats)
                    )
                    db.add(stats_config)

                # Also store last update time
                stats_time_config = (
                    db.query(AppConfig)
                    .filter(AppConfig.key == "paperless_stats_updated")
                    .first()
                )
                if stats_time_config:
                    stats_time_config.value = datetime.utcnow().isoformat()
                else:
                    stats_time_config = AppConfig(
                        key="paperless_stats_updated",
                        value=datetime.utcnow().isoformat(),
                    )
                    db.add(stats_time_config)

                db.commit()
                logger.info("Paperless statistics refreshed successfully")

                return {
                    "status": "success",
                    "message": "Statistics refreshed successfully",
                    "stats": paperless_stats,
                }
            else:
                raise HTTPException(
                    status_code=500, detail="Failed to fetch statistics"
                )

    except Exception as e:
        logger.error(f"Failed to refresh statistics: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to refresh statistics: {str(e)}"
        )


@router.get("/sync/status")
async def get_sync_status(db: Session = Depends(get_db)):
    """Get current sync status"""
    # Convert datetime objects to ISO strings for JSON serialization
    status_copy = sync_status.copy()

    # If no sync is in progress and completed_at is None, check if we have documents
    # This handles the case where the app has restarted and lost in-memory status
    if not status_copy["is_syncing"] and status_copy["completed_at"] is None:
        document_count = db.query(Document).count()
        if document_count > 0:
            # We have documents, so a sync must have happened previously
            # Get the most recent document's last_processed timestamp
            most_recent = (
                db.query(Document).order_by(Document.last_processed.desc()).first()
            )
            if most_recent and most_recent.last_processed:
                status_copy["completed_at"] = most_recent.last_processed
                status_copy["documents_synced"] = document_count

    if status_copy.get("started_at") and isinstance(
        status_copy["started_at"], datetime
    ):
        status_copy["started_at"] = status_copy["started_at"].isoformat()
    if status_copy.get("completed_at") and isinstance(
        status_copy["completed_at"], datetime
    ):
        status_copy["completed_at"] = status_copy["completed_at"].isoformat()
    return status_copy
