import logging
from datetime import UTC, datetime
from typing import Any

from dateutil import parser as date_parser
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
ALLOWED_DECISIONS = {"accept", "reject", "edit", "pending"}


def _normalize_tag_entries(tag_entries: Any | None) -> list[str]:
    if not tag_entries:
        return []
    if isinstance(tag_entries, str):
        entries = [part.strip() for part in tag_entries.split(",")]
    elif isinstance(tag_entries, list):
        entries = tag_entries
    else:
        return []

    tags: list[str] = []
    for entry in entries:
        tag_name = None
        if isinstance(entry, dict):
            tag_name = entry.get("value") or entry.get("name")
        elif isinstance(entry, str):
            tag_name = entry
        elif entry is not None:
            tag_name = str(entry)

        if not tag_name:
            continue
        tag_name = tag_name.strip()
        if tag_name:
            tags.append(tag_name)

    deduped: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        lowered = tag.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(tag)

    return deduped


def _coerce_string(value: Any | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    try:
        return str(value).strip() or None
    except Exception:
        return None


def _parse_override_date(value: Any | None) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = date_parser.parse(str(value))
        except Exception:
            return None
    if parsed and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


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
    include_failed: bool = Field(
        False, description="Include failed results when re-applying."
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


class AIResultUpdateRequest(BaseModel):
    field_decisions: dict[str, str] | None = Field(
        None, description="Per-field decisions (accept, reject, edit, pending)."
    )
    field_overrides: dict[str, Any] | None = Field(
        None, description="Per-field override values when editing suggestions."
    )
    status: str | None = Field(
        None, description="Optional status override (pending_review or rejected)."
    )

    @field_validator("field_decisions")
    @classmethod
    def validate_decisions(cls, value):
        if value is None:
            return value
        invalid_fields = [key for key in value if key not in DEFAULT_FIELDS]
        if invalid_fields:
            raise ValueError(f"Invalid fields: {', '.join(invalid_fields)}")
        invalid_decisions = [
            decision for decision in value.values() if decision not in ALLOWED_DECISIONS
        ]
        if invalid_decisions:
            raise ValueError(
                f"Invalid decisions: {', '.join(sorted(set(invalid_decisions)))}"
            )
        return value

    @field_validator("field_overrides")
    @classmethod
    def validate_overrides(cls, value):
        if value is None:
            return value
        invalid_fields = [key for key in value if key not in DEFAULT_FIELDS]
        if invalid_fields:
            raise ValueError(f"Invalid fields: {', '.join(invalid_fields)}")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        if value is None:
            return value
        allowed = {"pending_review", "rejected"}
        if value not in allowed:
            raise ValueError(f"Invalid status: {value}")
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
    field_decisions: dict[str, str] | None = None
    field_overrides: dict[str, Any] | None = None
    error: str | None = None


class AIHealthResponse(BaseModel):
    healthy: bool
    message: str | None = None
    checked_at: datetime


def _build_result_item(result: AIExtractionResult) -> AIResultItem:
    doc = result.document
    return AIResultItem(
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
        field_decisions=result.field_decisions,
        field_overrides=result.field_overrides,
        error=result.error,
    )


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

    payload = [_build_result_item(result) for result in results]

    return {
        "job": AIJobSummary.model_validate(job, from_attributes=True),
        "results": payload,
    }


@router.patch("/results/{result_id}", response_model=AIResultItem)
async def update_ai_result(
    result_id: int, request: AIResultUpdateRequest, db: Session = Depends(get_db)
):
    """Update per-field AI review decisions/overrides for a result."""
    result = (
        db.query(AIExtractionResult)
        .options(joinedload(AIExtractionResult.document))
        .filter(AIExtractionResult.id == result_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    if request.field_decisions is not None:
        result.field_decisions = request.field_decisions
    if request.field_overrides is not None:
        result.field_overrides = request.field_overrides
    if request.status is not None:
        result.status = request.status
        if request.status == "rejected":
            result.error = None

    db.commit()
    db.refresh(result)
    return _build_result_item(result)


@router.post("/jobs/{job_id}/apply")
async def apply_ai_results(
    job_id: int, request: ApplyJobRequest, db: Session = Depends(get_db)
):
    """Apply approved AI results to Paperless-ngx and local cache."""
    job = db.query(AIExtractionJob).filter(AIExtractionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    target_fields = job.target_fields or DEFAULT_FIELDS
    if "all" in target_fields:
        target_fields = DEFAULT_FIELDS

    fields = request.fields or target_fields
    if "all" in fields:
        fields = DEFAULT_FIELDS

    is_full_apply = set(fields) == set(target_fields)

    status_filters = ["pending_review"]
    if request.include_failed:
        status_filters.append("failed")

    results_query = (
        db.query(AIExtractionResult)
        .options(joinedload(AIExtractionResult.document))
        .filter(AIExtractionResult.job_id == job_id)
        .filter(AIExtractionResult.status.in_(status_filters))
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
    rejected: list[int] = []
    failed: list[dict[str, Any]] = []
    skipped: list[int] = []

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
                result.status = "failed"
                result.error = "Document not found for this result"
                failed.append({"id": result.id, "error": result.error})
                continue

            if not document.paperless_id:
                result.status = "failed"
                result.error = "Document missing Paperless identifier"
                failed.append({"id": result.id, "error": result.error})
                continue

            decisions = result.field_decisions or {}
            overrides = result.field_overrides or {}

            def resolve_value(field: str, suggested: Any, coerce):
                decision = decisions.get(field)
                if decision == "reject":
                    return None
                if decision == "edit":
                    return coerce(overrides.get(field))
                if decision == "pending":
                    return coerce(suggested)
                return coerce(suggested)

            update_payload: dict[str, Any] = {}
            local_updates: dict[str, Any] = {}
            applied_tags: list[int] = []
            tags_to_merge: list[str] = []

            if "title" in fields:
                title_value = resolve_value(
                    "title", result.suggested_title, _coerce_string
                )
                if title_value:
                    update_payload["title"] = title_value[:500]
                    local_updates["title"] = title_value[:500]

            if "correspondent" in fields:
                name = resolve_value(
                    "correspondent", result.suggested_correspondent, _coerce_string
                )
                if name:
                    corr_id = correspondent_lookup.get(name.lower())
                    if not corr_id:
                        corr_id = await client.create_correspondent(name)
                        if corr_id:
                            correspondent_lookup[name.lower()] = corr_id
                    if corr_id:
                        update_payload["correspondent"] = corr_id
                        local_updates["correspondent"] = name

            if "document_type" in fields:
                dtype = resolve_value(
                    "document_type", result.suggested_document_type, _coerce_string
                )
                if dtype:
                    dtype_id = document_type_lookup.get(dtype.lower())
                    if not dtype_id:
                        dtype_id = await client.create_document_type(dtype)
                        if dtype_id:
                            document_type_lookup[dtype.lower()] = dtype_id
                    if dtype_id:
                        update_payload["document_type"] = dtype_id
                        local_updates["document_type"] = dtype

            if "date" in fields:
                date_value = resolve_value(
                    "date", result.suggested_date, _parse_override_date
                )
                if date_value:
                    update_payload["created"] = date_value
                    local_updates["created_date"] = date_value

            if "tags" in fields:
                tag_values = resolve_value(
                    "tags", result.suggested_tags, _normalize_tag_entries
                )
                for tag_name in tag_values or []:
                    tags_to_merge.append(tag_name)
                    tag_id = tag_lookup.get(tag_name.lower())
                    if not tag_id:
                        tag_id = await client.create_tag(tag_name)
                        if tag_id:
                            tag_lookup[tag_name.lower()] = tag_id
                    if tag_id:
                        applied_tags.append(tag_id)

            if not update_payload and not applied_tags:
                if is_full_apply:
                    result.status = "rejected"
                    result.error = None
                    rejected.append(result.id)
                else:
                    skipped.append(result.id)
                continue

            try:
                metadata_updated = True
                if update_payload:
                    metadata_updated = await client.update_document_metadata(
                        document.paperless_id, update_payload
                    )

                tags_applied = True
                if applied_tags:
                    tags_applied = await client.add_tags_to_document(
                        document.paperless_id, applied_tags
                    )

                if not metadata_updated or not tags_applied:
                    failed_parts = []
                    if not metadata_updated:
                        failed_parts.append("metadata")
                    if not tags_applied:
                        failed_parts.append("tags")
                    error_message = (
                        "Paperless update failed"
                        if not failed_parts
                        else f"Paperless update failed for {', '.join(failed_parts)}"
                    )
                    result.status = "failed"
                    result.error = error_message
                    failed.append({"id": result.id, "error": error_message})
                    continue

                for key, value in local_updates.items():
                    if key == "title":
                        document.title = value
                    elif key == "correspondent":
                        document.correspondent = value
                    elif key == "document_type":
                        document.document_type = value
                    elif key == "created_date":
                        document.created_date = value

                if applied_tags:
                    document.tags = sorted(set((document.tags or []) + tags_to_merge))

                result.status = "applied"
                result.applied_at = datetime.now(UTC)
                result.error = None
                applied += 1

            except Exception as exc:  # noqa: BLE001
                result.status = "failed"
                result.error = str(exc)
                failed.append({"id": result.id, "error": str(exc)})

        db.commit()

    return {
        "status": "ok",
        "applied": applied,
        "skipped": skipped,
        "rejected": rejected,
        "failed": failed,
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
