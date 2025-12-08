import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import AppConfig, get_db
from paperless_dedupe.services.paperless_client import PaperlessClient

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfigUpdate(BaseModel):
    paperless_url: str | None = Field(None, description="Paperless-ngx API URL")
    paperless_api_token: str | None = Field(
        None, description="API Token for authentication"
    )
    paperless_username: str | None = Field(
        None, description="Username for authentication"
    )
    paperless_password: str | None = Field(
        None, description="Password for authentication"
    )
    fuzzy_match_threshold: int | None = Field(
        None, ge=50, le=100, description="Fuzzy matching threshold (50-100)"
    )
    max_ocr_length: int | None = Field(
        None, ge=1000, description="Maximum OCR text length to store"
    )
    min_ocr_word_count: int | None = Field(
        None,
        ge=0,
        le=1000,
        description="Minimum words in OCR to include in deduplication",
    )
    lsh_threshold: float | None = Field(
        None, ge=0.0, le=1.0, description="LSH similarity threshold"
    )
    enable_fuzzy_matching: bool | None = Field(
        None, description="Enable expensive fuzzy text matching"
    )
    fuzzy_match_sample_size: int | None = Field(
        None, ge=100, le=10000, description="Characters to sample for fuzzy matching"
    )
    confidence_weight_jaccard: int | None = Field(
        None, ge=0, le=100, description="Weight for Jaccard similarity (0-100)"
    )
    confidence_weight_fuzzy: int | None = Field(
        None, ge=0, le=100, description="Weight for fuzzy text matching (0-100)"
    )
    confidence_weight_metadata: int | None = Field(
        None, ge=0, le=100, description="Weight for metadata similarity (0-100)"
    )
    confidence_weight_filename: int | None = Field(
        None,
        ge=0,
        le=100,
        description="Weight for filename similarity (0-100, currently unused)",
    )
    openai_api_key: str | None = Field(
        None, description="OpenAI API key for AI metadata extraction"
    )
    openai_model: str | None = Field(
        None,
        description="OpenAI model to use for metadata extraction (gpt-5.1, gpt-5-mini, gpt-5-nano)",
    )
    openai_reasoning_effort: str | None = Field(
        None,
        description="Reasoning depth to trade latency for quality (low, medium, high)",
    )
    ai_max_input_chars: int | None = Field(
        None,
        ge=1000,
        le=100000,
        description="Maximum characters of document content sent to the LLM per document",
    )

    @field_validator("paperless_url")
    @classmethod
    def validate_url(cls, v):
        if v is None:
            return v
        # Basic URL validation
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        # Remove trailing slashes for consistency
        return v.rstrip("/")

    @field_validator("confidence_weight_filename")
    @classmethod
    def validate_weights(cls, v, info):
        """Validate that content-based weights sum to 100 if provided"""
        weights = []
        for key in [
            "confidence_weight_jaccard",
            "confidence_weight_fuzzy",
            "confidence_weight_metadata",
        ]:
            if key in info.data and info.data[key] is not None:
                weights.append(info.data[key])

        if weights and len(weights) == 3:  # All content weights provided
            total = sum(weights)
            if total != 100:
                raise ValueError(
                    f"Confidence weights must sum to 100 (currently {total})"
                )

        return v

    @field_validator("openai_model")
    @classmethod
    def validate_openai_model(cls, v):
        if v is None:
            return v
        allowed_models = {"gpt-5.1", "gpt-5-mini", "gpt-5-nano"}
        if v not in allowed_models:
            raise ValueError(
                f"Model must be one of {', '.join(sorted(allowed_models))}"
            )
        return v

    @field_validator("openai_reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v):
        if v is None:
            return v
        allowed = {"low", "medium", "high"}
        if v not in allowed:
            raise ValueError(
                f"Reasoning effort must be one of {', '.join(sorted(allowed))}"
            )
        return v


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    paperless_version: str | None = None


@router.get("/")
async def get_config(db: Session = Depends(get_db)):
    """Get current configuration"""
    # Get config from database
    db_config = {}
    config_items = db.query(AppConfig).all()
    for item in config_items:
        # Convert stored text values back to appropriate types
        value = item.value
        if value is not None and isinstance(value, str):
            # Try to convert to appropriate type
            if value.lower() in ("true", "false"):
                value = value.lower() == "true"
            elif value.replace(".", "", 1).replace("-", "", 1).isdigit():
                # It's a number
                if "." in value:
                    value = float(value)
                else:
                    value = int(value)
            # Otherwise keep as string
        db_config[item.key] = value

    # Merge with settings
    return {
        "paperless_url": db_config.get("paperless_url", settings.paperless_url),
        "paperless_api_configured": bool(
            db_config.get("paperless_api_token", settings.paperless_api_token)
            or (
                db_config.get("paperless_username", settings.paperless_username)
                and db_config.get("paperless_password", settings.paperless_password)
            )
        ),
        "fuzzy_match_threshold": db_config.get(
            "fuzzy_match_threshold", settings.fuzzy_match_threshold
        ),
        "max_ocr_length": db_config.get("max_ocr_length", settings.max_ocr_length),
        "lsh_threshold": db_config.get("lsh_threshold", settings.lsh_threshold),
        "enable_fuzzy_matching": db_config.get(
            "enable_fuzzy_matching", settings.enable_fuzzy_matching
        ),
        "fuzzy_match_sample_size": db_config.get(
            "fuzzy_match_sample_size", settings.fuzzy_match_sample_size
        ),
        "confidence_weight_jaccard": db_config.get(
            "confidence_weight_jaccard", settings.confidence_weight_jaccard
        ),
        "confidence_weight_fuzzy": db_config.get(
            "confidence_weight_fuzzy", settings.confidence_weight_fuzzy
        ),
        "confidence_weight_metadata": db_config.get(
            "confidence_weight_metadata", settings.confidence_weight_metadata
        ),
        "confidence_weight_filename": db_config.get(
            "confidence_weight_filename", settings.confidence_weight_filename
        ),
        "openai_model": db_config.get("openai_model", settings.openai_model),
        "openai_reasoning_effort": db_config.get(
            "openai_reasoning_effort", settings.openai_reasoning_effort
        ),
        "ai_max_input_chars": db_config.get(
            "ai_max_input_chars", settings.ai_max_input_chars
        ),
        "openai_configured": bool(
            db_config.get("openai_api_key", settings.openai_api_key)
        ),
        "openai_health_status": db_config.get("openai_health_status"),
        "openai_health_checked_at": db_config.get("openai_health_checked_at"),
        "minhash_num_perm": settings.minhash_num_perm,
        "lsh_num_bands": settings.lsh_num_bands,
        "api_rate_limit": settings.api_rate_limit,
        "api_page_size": settings.api_page_size,
    }


@router.put("/")
async def update_config(config_update: ConfigUpdate, db: Session = Depends(get_db)):
    """Update configuration"""
    updated_fields = []
    weights_changed = False

    # Check if confidence weights are being updated
    weight_fields = [
        "confidence_weight_jaccard",
        "confidence_weight_fuzzy",
        "confidence_weight_metadata",
        "confidence_weight_filename",
    ]

    # Update each provided field
    for field, value in config_update.model_dump(exclude_unset=True).items():
        if value is not None:
            # Convert value to string for storage
            str_value = str(value)

            # Check if config exists
            config_item = db.query(AppConfig).filter(AppConfig.key == field).first()

            if config_item:
                # Check if this is a weight field and if it's actually changing
                if field in weight_fields and config_item.value != str_value:
                    weights_changed = True
                config_item.value = str_value
            else:
                if field in weight_fields:
                    weights_changed = True
                config_item = AppConfig(key=field, value=str_value)
                db.add(config_item)

            updated_fields.append(field)

            # Update runtime settings
            if hasattr(settings, field):
                setattr(settings, field, value)

    db.commit()

    response = {
        "status": "success",
        "updated_fields": updated_fields,
        "message": f"Updated {len(updated_fields)} configuration fields",
        "weights_changed": weights_changed,
    }

    # If weights changed, trigger re-analysis through worker
    if weights_changed:
        logger.info("Confidence weights changed, triggering re-analysis via worker")
        response["message"] += ". Confidence weights changed - triggering re-analysis."

        # Dispatch Celery task for re-analysis
        from paperless_dedupe.worker.celery_app import app as celery_app
        from paperless_dedupe.worker.tasks.deduplication import analyze_duplicates

        # Check if there's already an analysis in progress
        active_tasks = celery_app.control.inspect().active()
        analysis_in_progress = False
        if active_tasks:
            for _worker, tasks in active_tasks.items():
                for task in tasks:
                    if "deduplication.analyze_duplicates" in task.get("name", ""):
                        analysis_in_progress = True
                        break

        if not analysis_in_progress:
            task = analyze_duplicates.apply_async(
                kwargs={
                    "threshold": settings.fuzzy_match_threshold / 100.0,
                    "force_rebuild": True,
                    "limit": None,
                    "broadcast_progress": True,
                },
                queue="deduplication",
            )
            response["reanalysis_triggered"] = True
            response["task_id"] = task.id
        else:
            response["reanalysis_triggered"] = False
            response["message"] += " (Analysis already in progress)"

    return response


@router.post("/test-connection")
async def test_paperless_connection(
    test_config: ConfigUpdate | None = None, db: Session = Depends(get_db)
):
    """Test connection to paperless-ngx API

    Can test either:
    1. Provided configuration (without saving)
    2. Saved configuration from database
    3. Default configuration from settings
    """

    if test_config and test_config.paperless_url:
        # Use provided test configuration (not saved yet)
        test_settings = {
            "paperless_url": test_config.paperless_url,
            "paperless_api_token": test_config.paperless_api_token,
            "paperless_username": test_config.paperless_username,
            "paperless_password": test_config.paperless_password,
        }
        logger.info(
            f"Testing with provided config: paperless_url={test_settings['paperless_url']}"
        )
    else:
        # Get current config from database
        from paperless_dedupe.core.config_utils import get_current_paperless_config

        test_settings = get_current_paperless_config(db)
        logger.info(
            f"Testing with saved config: paperless_url={test_settings['paperless_url']}"
        )

    try:
        # Create client with explicit configuration
        async with PaperlessClient(**test_settings) as client:
            # Log the URL being tested
            logger.info(f"Testing connection to: {client.base_url}")

            success = await client.test_connection()

            if success:
                # Try to get document count as a test
                try:
                    # Use the get_documents method which returns paginated results
                    data = await client.get_documents(page=1, page_size=1)
                    doc_count = data.get("count", 0)
                    version = f"Connected (found {doc_count} documents)"
                except Exception as e:
                    logger.warning(f"Could not get document count from API: {e}")
                    version = "Connected"

                return ConnectionTestResponse(
                    success=True,
                    message="Successfully connected to paperless-ngx",
                    paperless_version=version,
                )
            else:
                return ConnectionTestResponse(
                    success=False,
                    message="Failed to connect to paperless-ngx. Please check your configuration.",
                )
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        return ConnectionTestResponse(
            success=False, message=f"Connection failed: {str(e)}"
        )


@router.post("/reset")
async def reset_config(db: Session = Depends(get_db)):
    """Reset configuration to defaults"""
    # Delete all config items
    db.query(AppConfig).delete()
    db.commit()

    # Reset runtime settings to defaults (preserve env overrides)
    default_settings = settings.__class__()  # type: ignore[call-arg]
    for key, value in default_settings.model_dump().items():
        setattr(settings, key, value)

    return {"status": "success", "message": "Configuration reset to defaults"}
