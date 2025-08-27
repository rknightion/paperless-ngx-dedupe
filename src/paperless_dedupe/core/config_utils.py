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
    config_items = {item.key: item.value for item in db.query(AppConfig).all()}

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
    config_items = {item.key: item.value for item in db.query(AppConfig).all()}

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
        "fuzzy_match_threshold": config_items.get(
            "fuzzy_match_threshold", settings.fuzzy_match_threshold
        ),
        "max_ocr_length": config_items.get("max_ocr_length", settings.max_ocr_length),
        "lsh_threshold": config_items.get("lsh_threshold", settings.lsh_threshold),
    }
