import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from celery import Task, current_task
from celery.exceptions import SoftTimeLimitExceeded
from opentelemetry import trace
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import (
    Document,
    DocumentContent,
    DuplicateGroup,
    DuplicateMember,
)
from paperless_dedupe.services.deduplication_service import DeduplicationService
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.database import get_worker_session
from paperless_dedupe.worker.utils import broadcast_task_status

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class DeduplicationTask(Task):
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
    base=DeduplicationTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.deduplication.analyze_duplicates",
    max_retries=3,
    default_retry_delay=60,
)
def analyze_duplicates(
    self,
    threshold: float = None,
    force_rebuild: bool = False,
    limit: int = None,
    broadcast_progress: bool = True,
) -> dict[str, Any]:
    """Analyze documents for duplicates using MinHash/LSH and fuzzy matching.

    Args:
        threshold: Similarity threshold for duplicate detection
        force_rebuild: Whether to rebuild all duplicate groups
        limit: Limit number of documents to process
        broadcast_progress: Whether to broadcast progress via WebSocket

    Returns:
        Dictionary with task results and statistics
    """
    try:
        task_id = current_task.request.id
        start_time = datetime.now(UTC)

        with tracer.start_as_current_span(
            "duplicate_analysis.task",
            attributes={
                "celery.task_id": task_id,
                "force_rebuild": force_rebuild,
                "limit": limit or 0,
            },
        ) as task_span:
            # Update task state
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Initializing analysis",
                    "progress": 0,
                    "total": 0,
                    "started_at": start_time.isoformat(),
                },
            )

            # Broadcast initial status if enabled
            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step="Initializing analysis",
                        progress=0,
                        total=0,
                        started_at=start_time,
                        task_type="processing",
                    )
                )

            # Use threshold from settings if not provided
            # Convert from percentage (0-100) to decimal (0.0-1.0) if needed
            if threshold is None:
                threshold = settings.fuzzy_match_threshold / 100.0
            elif threshold > 1.0:
                # If passed as percentage, convert to decimal
                threshold = threshold / 100.0

            task_span.set_attribute("dedupe.threshold", threshold or 0.0)

            # Clear existing data if force rebuild
            if force_rebuild:
                self.update_state(
                    state="PROGRESS",
                    meta={
                        "current_step": "Clearing existing analysis data",
                        "progress": 0,
                    },
                )

                if broadcast_progress:
                    asyncio.run(
                        broadcast_task_status(
                            task_id=task_id,
                            status="processing",
                            step="Clearing existing analysis data",
                            progress=0,
                            started_at=start_time,
                            task_type="processing",
                        )
                    )

                # Delete all existing duplicate groups and members
                deleted_members = self.db.query(DuplicateMember).delete()
                deleted_groups = self.db.query(DuplicateGroup).delete()

                # Reset all documents to pending status
                self.db.query(Document).update(
                    {"processing_status": "pending", "last_processed": None}
                )

                self.db.commit()
                logger.info(
                    f"Cleared {deleted_groups} duplicate groups and {deleted_members} members"
                )

            # Get documents to process
            query = self.db.query(Document)
            if not force_rebuild:
                query = query.filter(Document.processing_status == "pending")
            if limit:
                query = query.limit(limit)

            documents = query.all()
            total_docs = len(documents)
            task_span.set_attribute("dedupe.documents.total", total_docs)

            if not documents:
                return {
                    "status": "completed",
                    "message": "No documents to process",
                    "documents_processed": 0,
                    "duplicates_found": 0,
                    "duration": 0,
                }

            logger.info(f"Processing {total_docs} documents for deduplication")

            # Update state with document count
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Loading document content",
                    "progress": 0,
                    "total": total_docs,
                },
            )

            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step="Loading document content",
                        progress=0,
                        total=total_docs,
                        started_at=start_time,
                        task_type="processing",
                    )
                )

            # Load document content in chunks
            contents = {}
            document_ids = [doc.id for doc in documents]
            chunk_size = 500

            with tracer.start_as_current_span(
                "duplicate_analysis.load_content",
                attributes={"dedupe.documents.chunk_size": chunk_size},
            ):
                for i in range(0, len(document_ids), chunk_size):
                    chunk_ids = document_ids[i : i + chunk_size]

                    # Update progress
                    progress = min(i + chunk_size, len(document_ids))
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "current_step": f"Loading document content ({progress}/{total_docs})",
                            "progress": progress,
                            "total": total_docs,
                        },
                    )

                    if (
                        broadcast_progress and i % 1000 == 0
                    ):  # Broadcast every 1000 docs
                        asyncio.run(
                            broadcast_task_status(
                                task_id=task_id,
                                status="processing",
                                step="Loading document content",
                                progress=progress,
                                total=total_docs,
                                started_at=start_time,
                                task_type="processing",
                            )
                        )

                    # Query content for chunk
                    doc_contents = (
                        self.db.query(DocumentContent)
                        .filter(DocumentContent.document_id.in_(chunk_ids))
                        .all()
                    )

                    for content in doc_contents:
                        # Use full_text (populated by sync) instead of normalized_text (never populated)
                        if content.full_text:
                            contents[content.document_id] = content.full_text

            # Initialize deduplication service
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Initializing deduplication service",
                    "progress": 0,
                    "total": total_docs,
                },
            )

            dedup_service = DeduplicationService()

            # Find duplicates
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Analyzing documents for duplicates",
                    "progress": 0,
                    "total": total_docs,
                },
            )

            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step="Analyzing documents for duplicates",
                        progress=0,
                        total=total_docs,
                        started_at=start_time,
                        task_type="processing",
                    )
                )

            # Create progress callback for deduplication service
            async def dedup_progress_callback(step: str, current: int, total: int):
                """Progress callback for deduplication service"""
                self.update_state(
                    state="PROGRESS",
                    meta={"current_step": step, "progress": current, "total": total},
                )

                if broadcast_progress:
                    await broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step=step,
                        progress=current,
                        total=total,
                        started_at=start_time,
                        task_type="processing",
                    )

            # Run deduplication with async support
            with tracer.start_as_current_span("duplicate_analysis.compute_duplicates"):
                duplicate_groups = asyncio.run(
                    dedup_service.find_duplicates(
                        documents,
                        contents,
                        threshold=threshold,
                        progress_callback=dedup_progress_callback,
                    )
                )

            # Save results to database
            self.update_state(
                state="PROGRESS",
                meta={
                    "current_step": "Saving duplicate groups to database",
                    "progress": total_docs,
                    "total": total_docs,
                },
            )

            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="processing",
                        step="Saving duplicate groups to database",
                        progress=total_docs,
                        total=total_docs,
                        started_at=start_time,
                        task_type="processing",
                    )
                )

            groups_created = 0
            with tracer.start_as_current_span("duplicate_analysis.persist_results"):
                for group in duplicate_groups:
                    # Extract component scores from the group data
                    component_scores = group.get("component_scores", {})

                    db_group = DuplicateGroup(
                        confidence_score=group.get(
                            "confidence", 0.0
                        ),  # Key is 'confidence' not 'confidence_score'
                        jaccard_similarity=component_scores.get("jaccard"),
                        fuzzy_text_ratio=component_scores.get("fuzzy"),
                        metadata_similarity=component_scores.get("metadata"),
                        filename_similarity=component_scores.get("filename"),
                        algorithm_version="2.0",
                    )
                    self.db.add(db_group)
                    self.db.flush()

                    # Get document IDs from the group
                    # The service returns 'documents' which is a list of Document objects
                    documents_in_group = group.get("documents", [])

                    for i, doc in enumerate(documents_in_group):
                        # Extract document ID - doc might be a Document object or dict
                        doc_id = doc.id if hasattr(doc, "id") else doc.get("id")

                        member = DuplicateMember(
                            group_id=db_group.id,
                            document_id=doc_id,
                            is_primary=(i == 0),
                        )
                        self.db.add(member)

                    groups_created += 1

                # Update document processing status
                for doc in documents:
                    doc.processing_status = "completed"
                    doc.last_processed = datetime.now(UTC)

                self.db.commit()

            # Calculate duration
            duration = (datetime.now(UTC) - start_time).total_seconds()

            result = {
                "status": "completed",
                "task_id": task_id,
                "documents_processed": total_docs,
                "duplicate_groups_found": groups_created,
                "threshold_used": threshold,
                "duration": duration,
                "started_at": start_time.isoformat(),
                "completed_at": datetime.now(UTC).isoformat(),
            }

            task_span.set_attribute("dedupe.groups.created", groups_created)
            task_span.set_attribute("dedupe.duration.seconds", duration)

            # Broadcast completion
            if broadcast_progress:
                asyncio.run(
                    broadcast_task_status(
                        task_id=task_id,
                        status="completed",
                        step="Analysis complete",
                        progress=total_docs,
                        total=total_docs,
                        result=result,
                        started_at=start_time,
                        completed_at=datetime.fromisoformat(result["completed_at"]),
                        task_type="processing",
                    )
                )

            logger.info(f"Deduplication analysis completed: {result}")
            return result

    except SoftTimeLimitExceeded:
        logger.error(f"Task {current_task.request.id} exceeded time limit")
        self.db.rollback()
        raise

    except Exception as e:
        trace.get_current_span().record_exception(e)
        logger.error(f"Error in deduplication task: {str(e)}", exc_info=True)
        self.db.rollback()

        # Broadcast error
        if broadcast_progress:
            asyncio.run(
                broadcast_task_status(
                    task_id=current_task.request.id,
                    status="failed",
                    step="Analysis failed",
                    error=str(e),
                    started_at=start_time,
                    task_type="processing",
                )
            )

        # Retry the task
        raise self.retry(exc=e) from e

    def _update_progress(self, progress: int, total: int, broadcast: bool):
        """Update task progress and optionally broadcast via WebSocket"""
        self.update_state(
            state="PROGRESS",
            meta={
                "current_step": f"Processing documents ({progress}/{total})",
                "progress": progress,
                "total": total,
            },
        )

        if broadcast and progress % 100 == 0:  # Broadcast every 100 documents
            asyncio.run(
                broadcast_task_status(
                    task_id=current_task.request.id,
                    status="processing",
                    step="Processing documents",
                    progress=progress,
                    total=total,
                    task_type="processing",
                )
            )


@app.task(
    name="paperless_dedupe.worker.tasks.deduplication.recalculate_confidence_scores"
)
def recalculate_confidence_scores(weights: dict[str, bool] = None) -> dict[str, Any]:
    """Recalculate confidence scores for all duplicate groups based on new weights.

    Args:
        weights: Dictionary of weight flags for score components

    Returns:
        Dictionary with task results
    """
    db = get_worker_session()
    try:
        if weights is None:
            weights = {
                "jaccard": True,
                "fuzzy": True,
                "metadata": True,
                "filename": True,
            }

        groups = db.query(DuplicateGroup).all()
        updated_count = 0

        for group in groups:
            new_score = group.recalculate_confidence(weights)
            if new_score != group.confidence_score:
                group.confidence_score = new_score
                updated_count += 1

        db.commit()

        return {
            "status": "completed",
            "groups_updated": updated_count,
            "total_groups": len(groups),
        }

    except Exception as e:
        logger.error(f"Error recalculating confidence scores: {str(e)}")
        db.rollback()
        raise

    finally:
        db.close()


@app.task(
    name="paperless_dedupe.worker.tasks.deduplication.cleanup_low_confidence_groups"
)
def cleanup_low_confidence_groups(min_confidence: float = 50.0) -> dict[str, Any]:
    """Remove duplicate groups with confidence scores below threshold.

    Args:
        min_confidence: Minimum confidence score to keep

    Returns:
        Dictionary with cleanup results
    """
    db = get_worker_session()
    try:
        # Find and delete low confidence groups
        low_confidence_groups = (
            db.query(DuplicateGroup)
            .filter(DuplicateGroup.confidence_score < min_confidence)
            .all()
        )

        deleted_count = len(low_confidence_groups)

        for group in low_confidence_groups:
            db.delete(group)

        db.commit()

        return {
            "status": "completed",
            "groups_deleted": deleted_count,
            "min_confidence_used": min_confidence,
        }

    except Exception as e:
        logger.error(f"Error cleaning up low confidence groups: {str(e)}")
        db.rollback()
        raise

    finally:
        db.close()
