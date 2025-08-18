import pytest
import asyncio
from typing import Generator, AsyncGenerator
import tempfile
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
import redis

from paperless_dedupe.main import app
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
    def override_get_db():
        try:
            db = temp_db()
            yield db
        finally:
            db.close()
    
    # Override the database dependency before creating the client
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # Clean up
    app.dependency_overrides.clear()


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
    
    # Replace the global cache service
    original_cache = cache_service
    cache_service.__dict__.update(mock_cache.__dict__)
    
    yield mock_cache
    
    # Restore original cache service
    cache_service.__dict__.update(original_cache.__dict__)


@pytest.fixture
def sample_documents():
    """Sample document data for testing"""
    return [
        {
            "paperless_id": 1,
            "title": "Invoice 2024-001",
            "fingerprint": "abc123def456",
            "file_size": 1024,
            "content": "This is an invoice for services rendered in January 2024. Total amount: $500.00"
        },
        {
            "paperless_id": 2,
            "title": "Invoice 2024-001 (Copy)",
            "fingerprint": "def456ghi789",
            "file_size": 1028,
            "content": "This is an invoice for services rendered in January 2024. Total amount: $500.00"
        },
        {
            "paperless_id": 3,
            "title": "Receipt for Coffee",
            "fingerprint": "ghi789jkl012",
            "file_size": 512,
            "content": "Coffee purchase receipt. Date: 2024-01-15. Amount: $4.50"
        }
    ]


@pytest.fixture
def sample_ocr_texts():
    """Sample OCR text data for testing deduplication"""
    return {
        "identical": [
            "This is the exact same document content",
            "This is the exact same document content"
        ],
        "similar": [
            "Invoice number 12345 dated January 1, 2024 for services rendered",
            "Invoice number 12345 dated January 1st, 2024 for services rendered"
        ],
        "different": [
            "This is a completely different document about cats",
            "This document discusses dogs and their behavior"
        ]
    }