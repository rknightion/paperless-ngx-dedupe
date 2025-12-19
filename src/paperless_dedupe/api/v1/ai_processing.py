import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from paperless_dedupe.core.config_utils import get_current_paperless_config
from paperless_dedupe.models.database import (
    AIExtractionJob,
    AIExtractionResult,
    AppConfig,
    Document,
    get_db,
)
from paperless_dedupe.services.ai_processing_service import AIProcessingService
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.tasks.ai_processing import run_ai_job

logger = logging.getLogger(__name__)
router = APIRouter()

DEFAULT_FIELDS = ["title", "correspondent", "document_type", "tags", "date"]


class AIJobRequest(BaseModel):
    tag: str | None = Field(
        None, description="Existing Paperless tag name to select documents."
    )
    include_all: bool = Field(
        False, description="Process all documents instead of filtering by tag."
    )
    target_fields: list[str] = Field(
        default_factory=lambda: ["all"],
        description="Fields to extract (title, correspondent, document_type, tags, date, all).",
    )

    @field_validator("target_fields")
    @classmethod
    def validate_fields(cls, value):
        allowed = set(DEFAULT_FIELDS + ["all"])
        invalid = [field for field in value if field not in allowed]
        if invalid:
            raise ValueError(f"Invalid fields: {', '.join(invalid)}")
        # Preserve order but drop duplicates
        seen = set()
        unique_fields = []
        for field in value:
            if field not in seen:
                unique_fields.append(field)
                seen.add(field)
        return unique_fields


class ApplyJobRequest(BaseModel):
    result_ids: list[int] | None = Field(
        None,
        description="Optional list of result IDs to apply. Defaults to all pending results for the job.",
    )
    fields: list[str] | None = Field(
        None,
        description="Optional subset of fields to apply. Defaults to the job's target fields.",
    )

    @field_validator("fields")
    @classmethod
    def validate_fields(cls, value):
        if value is None:
            return value
        allowed = set(DEFAULT_FIELDS + ["all"])
        invalid = [field for field in value if field not in allowed]
        if invalid:
            raise ValueError(f"Invalid fields: {', '.join(invalid)}")
        return value


class AIJobSummary(BaseModel):
    id: int
    status: str
    tag_filter: str | None = None
    include_all: bool
    target_fields: list[str]
    processed_count: int
    total_count: int
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AIResultItem(BaseModel):
    id: int
    job_id: int
    status: str
    document_id: int
    paperless_id: int
    document_title: str | None = None
    document_correspondent: str | None = None
    document_type: str | None = None
    document_tags: list[str] = []
    suggested_title: str | None = None
    title_confidence: float | None = None
    suggested_correspondent: str | None = None
    correspondent_confidence: float | None = None
    suggested_document_type: str | None = None
    document_type_confidence: float | None = None
    suggested_tags: list[dict] | None = None
    tags_confidence: float | None = None
    suggested_date: datetime | None = None
    date_confidence: float | None = None
    requested_fields: list[str] | None = None
    applied_at: datetime | None = None
    error: str | None = None


class AIHealthResponse(BaseModel):
    healthy: bool
    message: str | None = None
    checked_at: datetime


@router.post("/jobs", response_model=AIJobSummary)
async def create_ai_job(request: AIJobRequest, db: Session = Depends(get_db)):
    """Create a new AI extraction job and enqueue it."""
    if not request.include_all and not request.tag:
        raise HTTPException(
            status_code=400,
            detail="Select a tag or choose to process all documents.",
        )

    service = AIProcessingService(db)
    try:
        ai_settings = service._load_ai_settings()  # noqa: SLF001
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    docs_query = db.query(Document)
    documents = docs_query.options(joinedload(Document.content)).all()
    if request.tag:
        documents = [
            d
            for d in documents
            if any((tag or "").lower() == request.tag.lower() for tag in (d.tags or []))
        ]
    if not request.include_all and not request.tag:
        documents = []

    if not documents:
        raise HTTPException(
            status_code=400,
            detail="No documents match the selected criteria.",
        )

    target_fields = request.target_fields
    if "all" in target_fields:
        target_fields = DEFAULT_FIELDS

    job = AIExtractionJob(
        status="queued",
        tag_filter=request.tag,
        include_all=request.include_all,
        target_fields=target_fields,
        model=ai_settings.get("model"),
        reasoning_level=ai_settings.get("reasoning_effort"),
        max_input_chars=ai_settings.get("max_input_chars"),
        total_count=len(documents),
        processed_count=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = run_ai_job.apply_async(kwargs={"job_id": job.id}, queue="ai")
    logger.info("Queued AI job %s (task %s)", job.id, task.id)

    return AIJobSummary.model_validate(job, from_attributes=True)


@router.get("/jobs", response_model=list[AIJobSummary])
async def list_ai_jobs(db: Session = Depends(get_db)):
    """List recent AI extraction jobs."""
    jobs = (
        db.query(AIExtractionJob)
        .order_by(AIExtractionJob.created_at.desc())
        .limit(25)
        .all()
    )
    return [AIJobSummary.model_validate(job, from_attributes=True) for job in jobs]


@router.get("/jobs/{job_id}", response_model=AIJobSummary)
async def get_ai_job(job_id: int, db: Session = Depends(get_db)):
    """Get a single AI extraction job."""
    job = db.query(AIExtractionJob).filter(AIExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return AIJobSummary.model_validate(job, from_attributes=True)


@router.get("/jobs/{job_id}/results")
async def get_ai_results(
    job_id: int,
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=500),
):
    """Return extracted results for a job."""
    job = db.query(AIExtractionJob).filter(AIExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    results = (
        db.query(AIExtractionResult)
        .options(joinedload(AIExtractionResult.document))
        .filter(AIExtractionResult.job_id == job_id)
        .order_by(AIExtractionResult.created_at.desc())
        .limit(limit)
        .all()
    )

    payload = []
    for result in results:
        doc = result.document
        payload.append(
            AIResultItem(
                id=result.id,
                job_id=result.job_id,
                status=result.status,
                document_id=result.document_id,
                paperless_id=doc.paperless_id if doc else -1,
                document_title=doc.title if doc else None,
                document_correspondent=doc.correspondent if doc else None,
                document_type=doc.document_type if doc else None,
                document_tags=doc.tags or [] if doc else [],
                suggested_title=result.suggested_title,
                title_confidence=result.title_confidence,
                suggested_correspondent=result.suggested_correspondent,
                correspondent_confidence=result.correspondent_confidence,
                suggested_document_type=result.suggested_document_type,
                document_type_confidence=result.document_type_confidence,
                suggested_tags=result.suggested_tags,
                tags_confidence=result.tags_confidence,
                suggested_date=result.suggested_date,
                date_confidence=result.date_confidence,
                requested_fields=result.requested_fields,
                applied_at=result.applied_at,
                error=result.error,
            )
        )

    return {
        "job": AIJobSummary.model_validate(job, from_attributes=True),
        "results": payload,
    }


@router.post("/jobs/{job_id}/apply")
async def apply_ai_results(
    job_id: int, request: ApplyJobRequest, db: Session = Depends(get_db)
):
    """Apply approved AI results to Paperless-ngx and local cache."""
    job = db.query(AIExtractionJob).filter(AIExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    fields = request.fields or (job.target_fields or DEFAULT_FIELDS)
    if "all" in fields:
        fields = DEFAULT_FIELDS

    results_query = (
        db.query(AIExtractionResult)
        .options(joinedload(AIExtractionResult.document))
        .filter(AIExtractionResult.job_id == job_id)
        .filter(AIExtractionResult.status == "pending_review")
    )
    if request.result_ids:
        results_query = results_query.filter(
            AIExtractionResult.id.in_(request.result_ids)
        )

    results = results_query.all()
    if not results:
        raise HTTPException(status_code=400, detail="No pending results to apply")

    client_settings = get_current_paperless_config(db)
    if not client_settings.get("paperless_url"):
        raise HTTPException(
            status_code=400,
            detail="Paperless connection is not configured. Update settings first.",
        )

    applied = 0
    skipped = []

    async with PaperlessClient(**client_settings) as client:
        tag_lookup = {
            (tag.get("name") or "").lower(): tag.get("id")
            for tag in await client.get_tags()
            if tag.get("name") and tag.get("id") is not None
        }
        correspondent_lookup = {
            (c.get("name") or "").lower(): c.get("id")
            for c in await client.get_correspondents()
            if c.get("name") and c.get("id") is not None
        }
        document_type_lookup = {
            (d.get("name") or "").lower(): d.get("id")
            for d in await client.get_document_types()
            if d.get("name") and d.get("id") is not None
        }

        for result in results:
            document = result.document
            if not document:
                skipped.append(result.id)
                continue

            update_payload = {}
            applied_tags: list[int] = []
            tags_to_merge: list[str] = []
            metadata_updated = True

            if "title" in fields and result.suggested_title:
                update_payload["title"] = result.suggested_title[:500]
                document.title = result.suggested_title[:500]

            if "correspondent" in fields and result.suggested_correspondent:
                name = result.suggested_correspondent.strip()
                corr_id = correspondent_lookup.get(name.lower())
                if not corr_id:
                    corr_id = await client.create_correspondent(name)
                    if corr_id:
                        correspondent_lookup[name.lower()] = corr_id
                if corr_id:
                    update_payload["correspondent"] = corr_id
                    document.correspondent = name

            if "document_type" in fields and result.suggested_document_type:
                dtype = result.suggested_document_type.strip()
                dtype_id = document_type_lookup.get(dtype.lower())
                if not dtype_id:
                    dtype_id = await client.create_document_type(dtype)
                    if dtype_id:
                        document_type_lookup[dtype.lower()] = dtype_id
                if dtype_id:
                    update_payload["document_type"] = dtype_id
                    document.document_type = dtype

            if "date" in fields and result.suggested_date:
                update_payload["created"] = result.suggested_date
                document.created_date = result.suggested_date

            if "tags" in fields and result.suggested_tags:
                for tag_entry in result.suggested_tags:
                    tag_name = None
                    if isinstance(tag_entry, dict):
                        tag_name = tag_entry.get("value") or tag_entry.get("name")
                    elif isinstance(tag_entry, str):
                        tag_name = tag_entry

                    if not tag_name:
                        continue
                    tag_name = tag_name.strip()
                    if not tag_name:
                        continue

                    tags_to_merge.append(tag_name)
                    tag_id = tag_lookup.get(tag_name.lower())
                    if not tag_id:
                        tag_id = await client.create_tag(tag_name)
                        if tag_id:
                            tag_lookup[tag_name.lower()] = tag_id
                    if tag_id:
                        applied_tags.append(tag_id)

            # Apply updates
            if update_payload:
                metadata_updated = await client.update_document_metadata(
                    document.paperless_id, update_payload
                )

            tags_applied = True
            if applied_tags:
                tags_applied = await client.add_tags_to_document(
                    document.paperless_id, applied_tags
                )
                if tags_applied:
                    document.tags = sorted(set((document.tags or []) + tags_to_merge))

            if (
                (not update_payload and not applied_tags)
                or not metadata_updated
                or not tags_applied
            ):
                skipped.append(result.id)
                continue

            result.status = "applied"
            result.applied_at = datetime.now(UTC)
            db.add(result)
            applied += 1

        db.commit()

    return {
        "status": "ok",
        "applied": applied,
        "skipped": skipped,
        "remaining_pending": db.query(AIExtractionResult)
        .filter(
            AIExtractionResult.job_id == job_id,
            AIExtractionResult.status == "pending_review",
        )
        .count(),
    }


@router.get("/health", response_model=AIHealthResponse)
async def check_openai_health(db: Session = Depends(get_db)):
    """Validate OpenAI credentials/model once and store status."""
    service = AIProcessingService(db)
    try:
        ai_settings = service._load_ai_settings()  # noqa: SLF001
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    healthy, message = service.health_check(ai_settings)
    checked_at = datetime.now(UTC)

    # Persist health status
    def upsert(key: str, value: str):
        config_item = db.query(AppConfig).filter(AppConfig.key == key).first()
        if config_item:
            config_item.value = value
        else:
            db.add(AppConfig(key=key, value=value))

    upsert("openai_health_status", "healthy" if healthy else "unhealthy")
    upsert("openai_health_checked_at", checked_at.isoformat())
    upsert("openai_health_message", message or "")
    db.commit()

    return AIHealthResponse(healthy=healthy, message=message, checked_at=checked_at)
