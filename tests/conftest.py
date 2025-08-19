import pytest
import asyncio
from typing import Generator, AsyncGenerator
import tempfile
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from fastapi import FastAPI
from contextlib import asynccontextmanager
import redis

from paperless_dedupe.models.database import Base, get_db
from paperless_dedupe.core.config import settings
from paperless_dedupe.services.cache_service import cache_service


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def temp_db():
    """Create a temporary SQLite database for testing"""
    temp_db_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_db_path = temp_db_file.name
    temp_db_file.close()
    
    # Create test database
    test_db_url = f"sqlite:///{temp_db_path}"
    engine = create_engine(test_db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    yield TestingSessionLocal
    
    # Cleanup
    os.unlink(temp_db_path)


@pytest.fixture(scope="function") 
def client(temp_db):
    """Create a test client"""
    # Create a custom lifespan that skips database checks
    @asynccontextmanager
    async def test_lifespan(app):
        # Skip database connection check and initialization
        # Just yield without doing anything
        yield
    
    # Create a new app instance with test lifespan
    test_app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=test_lifespan
    )
    
    # Add all the routers
    from paperless_dedupe.api.v1 import documents, duplicates, config, processing
    test_app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
    test_app.include_router(duplicates.router, prefix="/api/v1", tags=["duplicates"])
    test_app.include_router(config.router, prefix="/api/v1/config", tags=["config"])
    test_app.include_router(processing.router, prefix="/api/v1/processing", tags=["processing"])
    
    # Add CORS middleware
    from fastapi.middleware.cors import CORSMiddleware
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins in tests
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    def override_get_db():
        try:
            db = temp_db()
            yield db
        finally:
            db.close()
    
    test_app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(test_app) as test_client:
        yield test_client
    
    # Clean up
    test_app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def db_session(temp_db):
    """Create a database session for testing"""
    session = temp_db()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
async def mock_cache():
    """Mock cache service for testing"""
    class MockCacheService:
        def __init__(self):
            self._cache = {}
        
        async def connect(self):
            pass
        
        async def disconnect(self):
            pass
        
        async def get_document_metadata(self, doc_id: int):
            return self._cache.get(f"metadata:{doc_id}")
        
        async def set_document_metadata(self, doc_id: int, metadata: dict):
            self._cache[f"metadata:{doc_id}"] = metadata
        
        async def get_document_ocr(self, doc_id: int):
            return self._cache.get(f"ocr:{doc_id}")
        
        async def set_document_ocr(self, doc_id: int, content: str):
            self._cache[f"ocr:{doc_id}"] = content
        
        async def get_duplicate_groups(self):
            return self._cache.get("duplicate_groups", [])
        
        async def set_duplicate_groups(self, groups: list):
            self._cache["duplicate_groups"] = groups
        
        async def clear_all(self):
            self._cache.clear()
    
    mock_cache = MockCacheService()
    return mock_cache


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset singleton instances between tests"""
    # Import here to avoid circular imports
    from paperless_dedupe.services.deduplication_service import DeduplicationService
    
    # Reset the singleton instance
    DeduplicationService._instance = None
    
    yield
    
    # Cleanup after test
    DeduplicationService._instance = None


# Pytest configuration for asyncio
pytest_plugins = ('pytest_asyncio',)