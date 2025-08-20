from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    app_name: str = "Paperless Dedupe"
    version: str = "0.1.0"
    debug: bool = True
    
    # Paperless API settings
    paperless_url: str = "http://localhost:8000"
    paperless_api_token: Optional[str] = None
    paperless_username: Optional[str] = None
    paperless_password: Optional[str] = None
    
    # Database settings
    database_url: str = "postgresql://paperless:paperless@localhost/paperless_dedupe"
    
    # Redis settings
    redis_url: str = "redis://localhost:6379/0"
    redis_ttl_metadata: int = 86400  # 24 hours
    redis_ttl_ocr: int = 604800  # 7 days
    redis_ttl_minhash: int = 2592000  # 30 days
    
    # Deduplication settings
    minhash_num_perm: int = 128
    lsh_threshold: float = 0.5
    lsh_num_bands: int = 20
    fuzzy_match_threshold: int = 80
    max_ocr_length: int = 10000  # Max characters to store per document
    min_ocr_word_count: int = 20  # Minimum words in OCR to include in deduplication
    enable_fuzzy_matching: bool = True  # Enable expensive fuzzy text matching
    fuzzy_match_sample_size: int = 2000  # Characters to sample for fuzzy matching
    
    # API settings
    api_rate_limit: int = 10  # requests per second
    api_page_size: int = 100
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

settings = Settings()