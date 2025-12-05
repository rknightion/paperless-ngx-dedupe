"""Configuration utilities for getting current config from database"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import AppConfig

logger = logging.getLogger(__name__)


def get_current_paperless_config(db: Session) -> dict[str, Any]:
    """Get current paperless configuration from database or defaults.

    Returns a dict with paperless_url, paperless_api_token,
    paperless_username, and paperless_password.
    """
    # Get config from database
    config_items = {}
    for item in db.query(AppConfig).all():
        # Since we store as text, values are already strings, no conversion needed
        config_items[item.key] = item.value

    # Return merged config
    return {
        "paperless_url": config_items.get("paperless_url", settings.paperless_url),
        "paperless_api_token": config_items.get(
            "paperless_api_token", settings.paperless_api_token
        ),
        "paperless_username": config_items.get(
            "paperless_username", settings.paperless_username
        ),
        "paperless_password": config_items.get(
            "paperless_password", settings.paperless_password
        ),
    }


def get_current_config(db: Session) -> dict[str, Any]:
    """Get all current configuration from database or defaults."""
    # Get config from database
    config_items = {}
    for item in db.query(AppConfig).all():
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
        config_items[item.key] = value

    # Return merged config
    return {
        "paperless_url": config_items.get("paperless_url", settings.paperless_url),
        "paperless_api_token": config_items.get(
            "paperless_api_token", settings.paperless_api_token
        ),
        "paperless_username": config_items.get(
            "paperless_username", settings.paperless_username
        ),
        "paperless_password": config_items.get(
            "paperless_password", settings.paperless_password
        ),
        "openai_api_key": config_items.get(
            "openai_api_key", settings.openai_api_key
        ),
        "openai_model": config_items.get("openai_model", settings.openai_model),
        "openai_reasoning_effort": config_items.get(
            "openai_reasoning_effort", settings.openai_reasoning_effort
        ),
        "ai_max_input_chars": config_items.get(
            "ai_max_input_chars", settings.ai_max_input_chars
        ),
        "ai_prompt_caching_enabled": config_items.get(
            "ai_prompt_caching_enabled", settings.ai_prompt_caching_enabled
        ),
        "fuzzy_match_threshold": config_items.get(
            "fuzzy_match_threshold", settings.fuzzy_match_threshold
        ),
        "max_ocr_length": config_items.get("max_ocr_length", settings.max_ocr_length),
        "lsh_threshold": config_items.get("lsh_threshold", settings.lsh_threshold),
        "confidence_weight_jaccard": config_items.get(
            "confidence_weight_jaccard", settings.confidence_weight_jaccard
        ),
        "confidence_weight_fuzzy": config_items.get(
            "confidence_weight_fuzzy", settings.confidence_weight_fuzzy
        ),
        "confidence_weight_metadata": config_items.get(
            "confidence_weight_metadata", settings.confidence_weight_metadata
        ),
        "confidence_weight_filename": config_items.get(
            "confidence_weight_filename", settings.confidence_weight_filename
        ),
    }
