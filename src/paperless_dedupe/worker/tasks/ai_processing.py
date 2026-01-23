import asyncio
import logging
from datetime import UTC, datetime

from celery import Task
from sqlalchemy.orm import joinedload

from paperless_dedupe.models.database import AIExtractionJob, Document
from paperless_dedupe.services.ai_processing_service import AIProcessingService
from paperless_dedupe.worker.celery_app import app
from paperless_dedupe.worker.database import get_worker_session
from paperless_dedupe.worker.utils import broadcast_task_status

logger = logging.getLogger(__name__)


class AIJobTask(Task):
    """Base task with DB session management."""

    def __init__(self):
        self.db = None

    def before_start(self, task_id, args, kwargs):
        self.db = get_worker_session()

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self.db:
            self.db.close()
            self.db = None


@app.task(
    base=AIJobTask,
    bind=True,
    name="paperless_dedupe.worker.tasks.ai_processing.run_ai_job",
)
def run_ai_job(self, job_id: int) -> dict:
    """Process a stored AI extraction job."""
    db = self.db
    if db is None:
        db = get_worker_session()

    job = db.query(AIExtractionJob).filter(AIExtractionJob.id == job_id).first()
    if not job:
        logger.error("AI job %s not found", job_id)
        return {"status": "error", "message": "job not found", "job_id": job_id}

    service = AIProcessingService(db)
    job.status = "running"
    job.started_at = datetime.now(UTC)
    job.error = None
    db.commit()
    task_id = getattr(self.request, "id", None) or f"ai_job_{job.id}"

    target_fields = job.target_fields or [
        "title",
        "correspondent",
        "document_type",
        "tags",
        "date",
    ]
    if "all" in target_fields:
        target_fields = ["title", "correspondent", "document_type", "tags", "date"]

    try:
        doc_query = db.query(Document).options(joinedload(Document.content))
        documents = doc_query.all()

        if job.tag_filter:
            documents = [
                d
                for d in documents
                if any(
                    (tag or "").lower() == job.tag_filter.lower()
                    for tag in (d.tags or [])
                )
            ]

        job.total_count = len(documents)
        db.commit()

        async def process_all():
            semaphore = asyncio.Semaphore(
                3
            )  # conservative concurrency to stay under OpenAI rate limits
            results: list = []
            last_broadcast = 0

            await broadcast_task_status(
                task_id=task_id,
                status="running",
                step="AI processing",
                progress=0,
                total=job.total_count,
                task_type="ai",
                job_id=job.id,
                started_at=job.started_at,
            )

            async def handle_doc(doc):
                async with semaphore:
                    try:
                        return await service.process_document_async(
                            job, doc, target_fields
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.error(
                            "Failed processing document %s in job %s: %s",
                            doc.id,
                            job.id,
                            exc,
                            exc_info=True,
                        )
                        return None

            tasks = [asyncio.create_task(handle_doc(doc)) for doc in documents]

            completed = 0
            for coro in asyncio.as_completed(tasks):
                result_obj = await coro
                completed += 1
                if result_obj:
                    results.append(result_obj)
                job.processed_count = completed
                if completed % 10 == 0:
                    db.commit()
                if completed - last_broadcast >= 5 or completed == job.total_count:
                    last_broadcast = completed
                    await broadcast_task_status(
                        task_id=task_id,
                        status="running",
                        step="AI processing",
                        progress=completed,
                        total=job.total_count,
                        task_type="ai",
                        job_id=job.id,
                        started_at=job.started_at,
                    )
            return results

        results = asyncio.run(process_all())

        for result_obj in results:
            db.add(result_obj)
        db.commit()

        job.status = "completed"
        job.completed_at = datetime.now(UTC)
        db.commit()

        asyncio.run(
            broadcast_task_status(
                task_id=task_id,
                status="completed",
                step="AI processing completed",
                progress=job.processed_count,
                total=job.total_count,
                task_type="ai",
                job_id=job.id,
                started_at=job.started_at,
                completed_at=job.completed_at,
            )
        )

        return {
            "status": "completed",
            "job_id": job.id,
            "processed": job.processed_count,
            "total": job.total_count,
        }
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.now(UTC)
        db.commit()
        asyncio.run(
            broadcast_task_status(
                task_id=task_id,
                status="failed",
                step="AI processing failed",
                progress=job.processed_count,
                total=job.total_count,
                task_type="ai",
                job_id=job.id,
                started_at=job.started_at,
                completed_at=job.completed_at,
                error=str(exc),
            )
        )
        logger.error("AI job %s failed: %s", job.id, exc, exc_info=True)
        return {"status": "failed", "job_id": job.id, "error": str(exc)}
