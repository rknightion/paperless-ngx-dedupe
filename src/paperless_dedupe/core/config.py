import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Paperless Dedupe"
    version: str = "0.1.0"
    debug: bool = True
    log_level: str = "WARNING"  # Can be DEBUG, INFO, WARNING, ERROR, CRITICAL

    # Paperless API settings
    paperless_url: str = "http://localhost:8000"
    paperless_api_token: str | None = None
    paperless_username: str | None = None
    paperless_password: str | None = None

    # Database settings
    database_url: str = "sqlite:///data/paperless_dedupe.db"

    # Deduplication settings
    minhash_num_perm: int = 128
    lsh_threshold: float = 0.5
    lsh_num_bands: int = 20
    fuzzy_match_threshold: int = 85
    max_ocr_length: int = (
        500000  # Fixed max characters to store per document (not user-configurable)
    )
    min_fuzzy_threshold: int = 50  # Minimum fuzzy threshold to store duplicate groups
    min_ocr_word_count: int = 20  # Minimum words in OCR to include in deduplication
    enable_fuzzy_matching: bool = True  # Enable expensive fuzzy text matching
    fuzzy_match_sample_size: int = (
        5000  # Characters to sample for fuzzy matching (increased for better accuracy)
    )
    
    # Confidence score weight configuration (percentages, must sum to 100)
    confidence_weight_jaccard: int = 40  # Weight for Jaccard similarity (MinHash)
    confidence_weight_fuzzy: int = 30    # Weight for fuzzy text matching  
    confidence_weight_metadata: int = 20 # Weight for metadata similarity
    confidence_weight_filename: int = 10 # Weight for filename similarity

    # API settings
    api_rate_limit: int = 10  # requests per second
    api_page_size: int = 200  # Increased for better performance
    api_max_retries: int = 3
    api_timeout: int = 30

    # Security settings
    secret_key: str = os.environ.get("SECRET_KEY", "change-me-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # File storage
    data_dir: str = "./data"
    cache_dir: str = "./cache"

    class Config:
        env_file = ".env"
        env_prefix = "PAPERLESS_DEDUPE_"
        extra = "allow"  # Allow extra env vars like OTEL_ without interference


settings = Settings()
