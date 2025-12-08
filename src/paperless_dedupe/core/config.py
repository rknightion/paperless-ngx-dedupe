import os

from pydantic_settings import BaseSettings, SettingsConfigDict

from paperless_dedupe import __version__


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="PAPERLESS_DEDUPE_",
        extra="allow",
    )

    app_name: str = "Paperless Dedupe"
    version: str = __version__
    debug: bool = True
    log_level: str = "WARNING"  # Can be DEBUG, INFO, WARNING, ERROR, CRITICAL

    # Paperless API settings
    paperless_url: str = "http://localhost:8000"
    paperless_api_token: str | None = None
    paperless_username: str | None = None
    paperless_password: str | None = None
    fetch_metadata_on_sync: bool = (
        False  # Avoid expensive /metadata calls unless explicitly enabled
    )

    # Database settings - PostgreSQL required
    database_url: str = (
        "postgresql://paperless_dedupe:paperless_dedupe@localhost:5432/paperless_dedupe"
    )

    # Task queue settings
    redis_url: str = "redis://localhost:6379/0"
    celery_result_expires: int = 86400  # Results expire after 1 day

    # Deduplication settings
    minhash_num_perm: int = 192
    lsh_threshold: float = 0.5
    lsh_num_bands: int = 20
    fuzzy_match_threshold: int = 85
    max_ocr_length: int = (
        500000  # Max OCR characters to store per document (UI adjustable)
    )
    min_fuzzy_threshold: int = 50  # Minimum fuzzy threshold to store duplicate groups
    min_ocr_word_count: int = 20  # Minimum words in OCR to include in deduplication
    enable_fuzzy_matching: bool = True  # Enable expensive fuzzy text matching
    fuzzy_match_sample_size: int = (
        5000  # Characters to sample for fuzzy matching (increased for better accuracy)
    )

    # Confidence score weight configuration (percentages, must sum to 100)
    # Default scoring leans on OCR content (Jaccard + a little fuzzy), metadata only as fallback
    confidence_weight_jaccard: int = 90  # Weight for Jaccard similarity (MinHash)
    confidence_weight_fuzzy: int = 10  # Weight for fuzzy text matching
    confidence_weight_metadata: int = (
        0  # Weight for metadata similarity (used as fallback if no text)
    )
    confidence_weight_filename: int = 0  # Filename similarity disabled by default

    # API settings
    api_rate_limit: int = 10  # requests per second
    api_page_size: int = 200  # Increased for better performance
    api_max_retries: int = 3
    api_timeout: int = 30

    # Security settings
    secret_key: str = os.environ.get("SECRET_KEY", "change-me-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # AI metadata extraction
    openai_api_key: str | None = None
    openai_model: str = "gpt-5-mini"  # Allowed: gpt-5.1, gpt-5-mini, gpt-5-nano
    openai_reasoning_effort: str = "medium"  # low, medium, high
    ai_max_input_chars: int = 12000

    # File storage
    data_dir: str = "./data"
    cache_dir: str = "./cache"


settings = Settings()
