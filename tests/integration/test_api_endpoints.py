import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock, AsyncMock
import json
from types import SimpleNamespace

from paperless_dedupe.models.database import (
    Document,
    DocumentContent,
    DuplicateGroup,
    DuplicateMember,
)
from paperless_dedupe.core.config import settings as app_settings


class TestDocumentsAPI:
    """Test suite for Documents API endpoints"""

    def test_list_documents_empty(self, client):
        """Test listing documents when database is empty"""
        response = client.get("/api/v1/documents/")
        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []
        assert data["count"] == 0
        assert data["next"] is None
        assert data["previous"] is None
        assert data["has_next"] is False
        assert data["has_prev"] is False

    def test_list_documents_with_data(self, client, db_session):
        """Test listing documents with data in database"""
        # Add test documents
        doc1 = Document(paperless_id=1, title="Test Doc 1", fingerprint="abc123")
        doc2 = Document(paperless_id=2, title="Test Doc 2", fingerprint="def456")

        db_session.add(doc1)
        db_session.add(doc2)
        db_session.commit()

        response = client.get("/api/v1/documents/")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2
        assert len(data["results"]) == 2  # API returns a paginated structure

        # Check document structure
        doc = data["results"][0]
        assert "id" in doc
        assert "paperless_id" in doc
        assert "title" in doc
        assert "processing_status" in doc
        assert doc["has_duplicates"] is False

    def test_list_documents_pagination(self, client, db_session):
        """Test document listing with pagination"""
        # Add multiple test documents
        for i in range(15):
            doc = Document(
                paperless_id=i + 1,
                title=f"Test Doc {i + 1}",
                fingerprint=f"fp{i + 1:03d}",
            )
            db_session.add(doc)
        db_session.commit()

        # Test first page
        response = client.get("/api/v1/documents/?limit=10&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 15
        assert len(data["results"]) == 10  # API returns a paginated structure
        assert data["has_next"] is True
        assert data["has_prev"] is False
        assert data["next"] == "?skip=10&limit=10"
        assert data["previous"] is None
        assert data["next_cursor"] is not None

        # Test second page
        response = client.get("/api/v1/documents/?limit=10&skip=10")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 15
        assert len(data["results"]) == 5  # API returns a paginated structure
        assert data["has_next"] is False
        assert data["has_prev"] is True
        assert data["next"] is None
        assert data["previous"] == "?skip=0&limit=10"
        assert data["next_cursor"] is None

    def test_get_document_by_id(self, client, db_session):
        """Test getting a specific document by ID"""
        doc = Document(
            paperless_id=123, title="Specific Doc", fingerprint="specific123"
        )
        db_session.add(doc)
        db_session.commit()

        response = client.get(f"/api/v1/documents/{doc.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["paperless_id"] == 123
        assert data["title"] == "Specific Doc"

    def test_get_document_not_found(self, client):
        """Test getting a non-existent document"""
        response = client.get("/api/v1/documents/999")
        assert response.status_code == 404

    def test_get_document_content(self, client, db_session):
        """Test getting document OCR content"""
        doc = Document(
            paperless_id=123, title="Doc with content", fingerprint="content123"
        )
        db_session.add(doc)
        db_session.flush()

        content = DocumentContent(
            document_id=doc.id,
            full_text="This is the OCR content of the document",
            word_count=8,
        )
        db_session.add(content)
        db_session.commit()

        response = client.get(f"/api/v1/documents/{doc.id}/content")
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "This is the OCR content of the document"
        assert data["word_count"] == 8

    def test_get_document_content_not_found(self, client):
        """Test getting content for non-existent document"""
        response = client.get("/api/v1/documents/999/content")
        assert response.status_code == 404

    def test_get_document_duplicates(self, client, db_session):
        """Test getting duplicates for a specific document"""
        # Create documents
        doc1 = Document(paperless_id=1, title="Original", fingerprint="orig123")
        doc2 = Document(paperless_id=2, title="Duplicate", fingerprint="dup123")
        db_session.add(doc1)
        db_session.add(doc2)
        db_session.flush()

        # Create duplicate group
        group = DuplicateGroup(confidence_score=0.85)
        db_session.add(group)
        db_session.flush()

        # Add members
        member1 = DuplicateMember(
            group_id=group.id, document_id=doc1.id, is_primary=True
        )
        member2 = DuplicateMember(
            group_id=group.id, document_id=doc2.id, is_primary=False
        )
        db_session.add(member1)
        db_session.add(member2)
        db_session.commit()

        response = client.get(f"/api/v1/documents/{doc1.id}/duplicates")
        assert response.status_code == 200
        data = response.json()
        assert len(data["duplicates"]) == 1  # doc2 is a duplicate of doc1
        assert data["duplicates"][0]["paperless_id"] == 2

    @patch("paperless_dedupe.services.paperless_client.PaperlessClient")
    async def test_sync_documents_success(self, mock_client_class, client, mock_cache):
        """Test successful document synchronization"""
        # Mock the paperless client
        mock_client = Mock()
        mock_client_class.return_value = mock_client

        # Mock document data from paperless
        mock_documents = [
            {
                "id": 1,
                "title": "Test Document 1",
                "fingerprint": "abc123",
                "content": "Document content 1",
                "archive_file_size": 1024,
                "created": "2024-01-01T00:00:00Z",
            },
            {
                "id": 2,
                "title": "Test Document 2",
                "fingerprint": "def456",
                "content": "Document content 2",
                "archive_file_size": 2048,
                "created": "2024-01-02T00:00:00Z",
            },
        ]

        mock_client.get_documents = AsyncMock(return_value=mock_documents)
        mock_client.get_document_content = AsyncMock(
            side_effect=lambda doc_id: f"Content for document {doc_id}"
        )

        with (
            patch(
                "paperless_dedupe.api.v1.documents.celery_app.control.inspect"
            ) as mock_inspect,
            patch(
                "paperless_dedupe.worker.tasks.document_sync.sync_documents.apply_async"
            ) as mock_apply_async,
        ):
            mock_inspect.return_value.active.return_value = {}
            mock_apply_async.return_value = SimpleNamespace(id="test-task")

            response = client.post("/api/v1/documents/sync", json={})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"
        assert data["task_id"] == "test-task"


class TestDuplicatesAPI:
    """Test suite for Duplicates API endpoints"""

    def test_list_duplicate_groups_empty(self, client):
        """Test listing duplicate groups when none exist"""
        response = client.get("/api/v1/duplicates/groups")
        assert response.status_code == 200
        data = response.json()
        assert data["groups"] == []
        assert data["count"] == 0
        assert data["page"] == 1
        assert data["total_pages"] == 0

    def test_list_duplicate_groups_with_data(self, client, db_session):
        """Test listing duplicate groups with data"""
        # Create documents
        doc1 = Document(paperless_id=1, title="Doc 1", fingerprint="abc123")
        doc2 = Document(paperless_id=2, title="Doc 2", fingerprint="def456")
        doc3 = Document(paperless_id=3, title="Doc 3", fingerprint="ghi789")
        db_session.add_all([doc1, doc2, doc3])
        db_session.flush()

        # Create duplicate group
        group = DuplicateGroup(confidence_score=0.85)
        db_session.add(group)
        db_session.flush()

        # Add members
        member1 = DuplicateMember(
            group_id=group.id, document_id=doc1.id, is_primary=True
        )
        member2 = DuplicateMember(
            group_id=group.id, document_id=doc2.id, is_primary=False
        )
        db_session.add_all([member1, member2])
        db_session.commit()

        response = client.get("/api/v1/duplicates/groups")
        assert response.status_code == 200
        data = response.json()
        assert len(data["groups"]) == 1
        assert data["count"] == 1

        group_data = data["groups"][0]
        assert pytest.approx(group_data["confidence"], rel=1e-3) == 0.85
        assert len(group_data["documents"]) == 2

    def test_get_duplicate_group_by_id(self, client, db_session):
        """Test getting a specific duplicate group"""
        # Create documents and group
        doc1 = Document(paperless_id=1, title="Doc 1", fingerprint="abc123")
        doc2 = Document(paperless_id=2, title="Doc 2", fingerprint="def456")
        db_session.add_all([doc1, doc2])
        db_session.flush()

        group = DuplicateGroup(confidence_score=0.90)
        db_session.add(group)
        db_session.flush()

        member1 = DuplicateMember(
            group_id=group.id, document_id=doc1.id, is_primary=True
        )
        member2 = DuplicateMember(
            group_id=group.id, document_id=doc2.id, is_primary=False
        )
        db_session.add_all([member1, member2])
        db_session.commit()

        response = client.get(f"/api/v1/duplicates/groups/{group.id}")
        assert response.status_code == 200
        data = response.json()
        assert pytest.approx(data["confidence"], rel=1e-3) == 0.90
        assert len(data["documents"]) == 2

    def test_get_duplicate_group_not_found(self, client):
        """Test getting a non-existent duplicate group"""
        response = client.get("/api/v1/duplicates/groups/999")
        assert response.status_code == 404

    def test_mark_group_as_reviewed(self, client, db_session):
        """Test marking a duplicate group as reviewed"""
        # Create group
        group = DuplicateGroup(confidence_score=0.85, reviewed=False)
        db_session.add(group)
        db_session.commit()

        response = client.post(f"/api/v1/duplicates/groups/{group.id}/review", json={})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["reviewed"] is True
        assert data["resolved"] is False

        # Verify in database
        db_session.refresh(group)
        assert group.reviewed is True

    def test_delete_duplicate_group(self, client, db_session):
        """Test deleting a duplicate group"""
        # Create documents and group
        doc1 = Document(paperless_id=1, title="Doc 1", fingerprint="abc123")
        doc2 = Document(paperless_id=2, title="Doc 2", fingerprint="def456")
        db_session.add_all([doc1, doc2])
        db_session.flush()

        group = DuplicateGroup(confidence_score=0.85)
        db_session.add(group)
        db_session.flush()

        member1 = DuplicateMember(
            group_id=group.id, document_id=doc1.id, is_primary=True
        )
        member2 = DuplicateMember(
            group_id=group.id, document_id=doc2.id, is_primary=False
        )
        db_session.add_all([member1, member2])
        db_session.commit()

        group_id = group.id

        response = client.delete(f"/api/v1/duplicates/groups/{group_id}")
        assert response.status_code == 200

        # Verify group is deleted
        deleted_group = (
            db_session.query(DuplicateGroup)
            .filter(DuplicateGroup.id == group_id)
            .first()
        )
        assert deleted_group is None

    def test_get_duplicate_statistics(self, client, db_session):
        """Test getting deduplication statistics"""
        # Create test data
        for i in range(10):
            doc = Document(
                paperless_id=i + 1, title=f"Doc {i + 1}", fingerprint=f"fp{i + 1}"
            )
            db_session.add(doc)
        db_session.flush()

        # Create some duplicate groups
        for i in range(3):
            group = DuplicateGroup(confidence_score=0.8 + i * 0.05)
            db_session.add(group)
            db_session.flush()

            # Add 2 documents to each group
            for j in range(2):
                doc_idx = i * 2 + j
                if doc_idx < 10:
                    member = DuplicateMember(
                        group_id=group.id, document_id=doc_idx + 1, is_primary=(j == 0)
                    )
                    db_session.add(member)

        db_session.commit()

        response = client.get("/api/v1/duplicates/statistics")
        assert response.status_code == 200
        data = response.json()

        assert "total_groups" in data
        assert "total_duplicates" in data
        assert "potential_deletions" in data
        assert "confidence_distribution" in data
        assert data["total_groups"] == 3
        assert data["total_duplicates"] == 6
        assert data["potential_deletions"] == 3


class TestProcessingAPI:
    """Test suite for Processing API endpoints"""

    def test_get_processing_status_initial(self, client):
        """Test getting processing status when no processing has started"""
        response = client.get("/api/v1/processing/status")
        assert response.status_code == 200
        data = response.json()
        assert data["is_processing"] is False
        assert "current_step" in data
        assert "progress" in data
        assert "total" in data

    def test_start_analysis_success(self, client, db_session):
        """Test starting deduplication analysis"""
        # Add a test document so we have something to process
        doc = Document(paperless_id=1, title="Test Doc", fingerprint="test123")
        db_session.add(doc)
        db_session.commit()

        with (
            patch(
                "paperless_dedupe.api.v1.processing.celery_app.control.inspect"
            ) as mock_inspect,
            patch(
                "paperless_dedupe.worker.tasks.deduplication.analyze_duplicates.apply_async"
            ) as mock_apply_async,
        ):
            mock_inspect.return_value.active.return_value = {}
            mock_apply_async.return_value = SimpleNamespace(id="analysis-task")

            response = client.post("/api/v1/processing/analyze", json={})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"
        assert "document_count" in data

    def test_start_analysis_no_documents(self, client):
        """Test starting analysis when no documents exist"""
        with patch(
            "paperless_dedupe.api.v1.processing.celery_app.control.inspect"
        ) as mock_inspect:
            mock_inspect.return_value.active.return_value = {}
            response = client.post("/api/v1/processing/analyze", json={})
        assert response.status_code == 400
        data = response.json()
        assert "No documents available" in data["detail"]

    def test_start_analysis_custom_threshold(self, client, db_session):
        """Test starting analysis with custom threshold"""
        # Add a test document
        doc = Document(paperless_id=1, title="Test Doc", fingerprint="test123")
        db_session.add(doc)
        db_session.commit()

        with (
            patch(
                "paperless_dedupe.api.v1.processing.celery_app.control.inspect"
            ) as mock_inspect,
            patch(
                "paperless_dedupe.worker.tasks.deduplication.analyze_duplicates.apply_async"
            ) as mock_apply_async,
        ):
            mock_inspect.return_value.active.return_value = {}
            mock_apply_async.return_value = SimpleNamespace(id="analysis-task")
            response = client.post(
                "/api/v1/processing/analyze", json={"threshold": 0.7}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"

    async def test_clear_cache(self, client, mock_cache):
        """Test clearing the cache"""
        response = client.post("/api/v1/processing/clear-cache")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "Cache clearing" in data["message"]


class TestConfigAPI:
    """Test suite for Configuration API endpoints"""

    def test_get_config_default(self, client):
        """Test getting default configuration"""
        response = client.get("/api/v1/config/")
        assert response.status_code == 200
        data = response.json()

        # Check that configuration fields are present
        assert "paperless_url" in data
        assert "fuzzy_match_threshold" in data
        assert "max_ocr_length" in data
        assert "lsh_threshold" in data

    def test_update_config(self, client):
        """Test updating configuration"""
        new_config = {
            "paperless_url": "http://test-paperless:8000",
            "fuzzy_match_threshold": 85,
            "max_ocr_length": 15000,
        }

        response = client.put("/api/v1/config/", json=new_config)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

        # Verify the configuration was updated
        response = client.get("/api/v1/config/")
        assert response.status_code == 200
        data = response.json()
        assert data["paperless_url"] == "http://test-paperless:8000"
        assert data["fuzzy_match_threshold"] == 85
        assert data["max_ocr_length"] == 15000

    def test_update_config_invalid_data(self, client):
        """Test updating configuration with invalid data"""
        invalid_config = {
            "fuzzy_match_threshold": 150,  # Invalid: > 100
            "max_ocr_length": -1000,  # Invalid: negative
        }

        response = client.put("/api/v1/config/", json=invalid_config)
        assert response.status_code == 422  # Validation error

    @patch("paperless_dedupe.api.v1.config.PaperlessClient")
    async def test_test_connection_success(self, mock_client_class, client):
        """Test successful connection to paperless"""
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.test_connection = AsyncMock(return_value=True)
        mock_client.get_documents = AsyncMock(return_value={"count": 0})
        mock_client_class.return_value = mock_client

        response = client.post("/api/v1/config/test-connection")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "connected" in data["message"].lower()

    @patch("paperless_dedupe.api.v1.config.PaperlessClient")
    async def test_test_connection_failure(self, mock_client_class, client):
        """Test failed connection to paperless"""
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.test_connection = AsyncMock(
            side_effect=Exception("Connection failed")
        )
        mock_client_class.return_value = mock_client

        response = client.post("/api/v1/config/test-connection")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "Connection failed" in data["message"]

    def test_reset_config(self, client):
        """Test resetting configuration to defaults"""
        # First modify config
        new_config = {"fuzzy_match_threshold": 85, "max_ocr_length": 15000}
        client.put("/api/v1/config/", json=new_config)

        # Reset to defaults
        response = client.post("/api/v1/config/reset")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

        # Verify config was reset
        response = client.get("/api/v1/config/")
        assert response.status_code == 200
        data = response.json()
        default_settings = app_settings.__class__()  # type: ignore[call-arg]
        assert data["fuzzy_match_threshold"] == default_settings.fuzzy_match_threshold
        assert data["max_ocr_length"] == default_settings.max_ocr_length
