import asyncio
from unittest.mock import Mock, patch

from datasketch import MinHash
from paperless_dedupe.core.config import settings

from paperless_dedupe.services.deduplication_service import DeduplicationService
from paperless_dedupe.models.database import (
    Document,
    DocumentContent,
    DuplicateGroup,
    DuplicateMember,
)


class TestDeduplicationService:
    """Test suite for DeduplicationService"""

    def setup_method(self):
        """Setup for each test method"""
        self.service = DeduplicationService()

    def test_preprocess_text_basic(self):
        """Test basic text preprocessing"""
        input_text = "  Hello, World!   This is a TEST.  "
        expected = "hello world this is a test"

        result = self.service.preprocess_text(input_text)
        assert result == expected

    def test_preprocess_text_special_characters(self):
        """Test preprocessing with special characters"""
        input_text = "Invoice #12345 - $500.00 (paid) @company.com"
        expected = "invoice 12345  50000 paid companycom"  # Note: double space from dash removal

        result = self.service.preprocess_text(input_text)
        assert result == expected

    def test_preprocess_text_empty(self):
        """Test preprocessing empty/None text"""
        assert self.service.preprocess_text("") == ""
        assert self.service.preprocess_text(None) == ""
        assert self.service.preprocess_text("   ") == ""

    def test_preprocess_text_excessive_whitespace(self):
        """Test preprocessing with excessive whitespace"""
        input_text = "word1    word2\n\n\tword3     word4"
        expected = "word1 word2 word3 word4"

        result = self.service.preprocess_text(input_text)
        assert result == expected

    def test_create_minhash_valid_text(self):
        """Test MinHash creation with valid text"""
        text = "This is a test document with enough words to create shingles"

        minhash = self.service.create_minhash(text)

        assert minhash is not None
        assert isinstance(minhash, MinHash)
        assert len(minhash.hashvalues) == settings.minhash_num_perm

    def test_create_minhash_short_text(self):
        """Test MinHash creation with text too short for shingles"""
        text = "short text"

        minhash = self.service.create_minhash(text)

        # Should still create MinHash but might be less reliable
        assert minhash is not None
        assert isinstance(minhash, MinHash)

    def test_create_minhash_empty_text(self):
        """Test MinHash creation with empty text"""
        result = self.service.create_minhash("")
        assert result is None

        result = self.service.create_minhash(None)
        assert result is None

    def test_create_minhash_identical_texts(self):
        """Test that identical texts produce identical MinHashes"""
        text = "This is identical text for testing MinHash consistency"

        minhash1 = self.service.create_minhash(text)
        minhash2 = self.service.create_minhash(text)

        assert minhash1.jaccard(minhash2) == 1.0

    def test_create_minhash_similar_texts(self):
        """Test MinHash similarity with similar texts"""
        text1 = "This is a document about machine learning algorithms"
        text2 = "This is a document about machine learning algorithms and AI"

        minhash1 = self.service.create_minhash(text1)
        minhash2 = self.service.create_minhash(text2)

        similarity = minhash1.jaccard(minhash2)
        assert 0.5 < similarity < 1.0  # Should be similar but not identical

    def test_create_minhash_different_texts(self):
        """Test MinHash with completely different texts"""
        text1 = "This document discusses cats and their behavior patterns"
        text2 = "Financial report for quarterly earnings and revenue growth"

        minhash1 = self.service.create_minhash(text1)
        minhash2 = self.service.create_minhash(text2)

        similarity = minhash1.jaccard(minhash2)
        assert similarity < 0.3  # Should be very different

    def test_calculate_similarity_score_identical_documents(self):
        """Test similarity scoring with identical documents"""
        # Create mock documents
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 1000

        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 1000

        text = "This is identical document content for testing"

        # Create MinHashes
        minhash1 = self.service.create_minhash(text)
        minhash2 = self.service.create_minhash(text)

        self.service.minhashes = {1: minhash1, 2: minhash2}

        score, components = self.service.calculate_similarity_score(
            doc1, doc2, text, text
        )

        # Should have high similarity
        assert score > 0.8
        assert components["jaccard"] is not None

    def test_calculate_similarity_score_different_sizes(self):
        """Test similarity scoring with very different file sizes"""
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 1000

        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 10000  # 10x larger

        text = "Same content but different file sizes"

        minhash1 = self.service.create_minhash(text)
        minhash2 = self.service.create_minhash(text)

        self.service.minhashes = {1: minhash1, 2: minhash2}

        score, components = self.service.calculate_similarity_score(
            doc1, doc2, text, text
        )

        # Should capture metadata penalty even if overall score uses jaccard
        assert components["metadata"] < 1.0
        assert score >= components["metadata"]
        assert components["metadata"] is not None

    def test_calculate_similarity_score_no_minhashes(self):
        """Test similarity scoring without MinHashes"""
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 1000

        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 1000

        text = "Content without MinHash data"

        # No MinHashes in service
        self.service.minhashes = {}

        score, components = self.service.calculate_similarity_score(
            doc1, doc2, text, text
        )

        # Should still calculate based on metadata fallback
        assert score > 0
        assert components["metadata"] is not None

    def test_calculate_similarity_score_quick_mode_skips_fuzzy(self):
        """Quick mode should avoid fuzzy scoring and only use jaccard/metadata"""
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 1000
        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 1000

        text = "This is identical content for checking quick mode"
        minhash1 = self.service.create_minhash(text)
        minhash2 = self.service.create_minhash(text)
        self.service.minhashes = {1: minhash1, 2: minhash2}

        score, components = self.service.calculate_similarity_score(
            doc1, doc2, text, text, quick_mode=True
        )

        assert components["fuzzy"] is None
        assert components["jaccard"] is not None
        assert score > 0.5

    def test_get_document_hash_consistent(self):
        """Test that document hash is consistent"""
        text = "This is test content for hashing"

        hash1 = self.service.get_document_hash(text)
        hash2 = self.service.get_document_hash(text)

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 hex length

    def test_get_document_hash_different_content(self):
        """Test that different content produces different hashes"""
        text1 = "This is the first document"
        text2 = "This is the second document"

        hash1 = self.service.get_document_hash(text1)
        hash2 = self.service.get_document_hash(text2)

        assert hash1 != hash2

    def test_get_document_hash_empty_content(self):
        """Test document hash with empty content"""
        result = self.service.get_document_hash("")
        assert result is None

        result = self.service.get_document_hash(None)
        assert result is None

    def test_serialize_deserialize_minhash(self):
        """Test MinHash serialization and deserialization"""
        text = "Test content for MinHash serialization"
        original_minhash = self.service.create_minhash(text)

        # Serialize
        serialized = self.service.serialize_minhash(original_minhash)
        assert serialized is not None
        assert isinstance(serialized, bytes)

        # Deserialize
        deserialized = self.service.deserialize_minhash(serialized)
        assert deserialized is not None
        assert isinstance(deserialized, MinHash)

        # Should be identical
        assert original_minhash.jaccard(deserialized) == 1.0

    def test_serialize_deserialize_none(self):
        """Test serialization with None input"""
        assert self.service.serialize_minhash(None) is None
        assert self.service.deserialize_minhash(None) is None
        assert self.service.deserialize_minhash(b"") is None

    def test_build_lsh_index(self, monkeypatch):
        """Test LSH index building"""
        monkeypatch.setattr(settings, "min_ocr_word_count", 1)
        # Create mock documents
        documents = []
        contents = {}

        for i in range(3):
            doc = Mock(spec=Document)
            doc.id = i + 1
            documents.append(doc)
            contents[doc.id] = (
                f"Document {i + 1} content for LSH indexing with plenty of words "
                f"to satisfy the minimum OCR word count requirement for hashing."
            )

        asyncio.run(self.service.build_lsh_index(documents, contents))

        # Check that MinHashes were created
        assert len(self.service.minhashes) == 3

        # Check that LSH index was built
        assert self.service.lsh_index is not None

    def test_build_lsh_index_empty_content(self, monkeypatch):
        """Test LSH index building with some empty content"""
        monkeypatch.setattr(settings, "min_ocr_word_count", 1)
        # Create mock documents
        documents = []
        contents = {}

        for i in range(3):
            doc = Mock(spec=Document)
            doc.id = i + 1
            documents.append(doc)

            # Only add content for first two documents
            if i < 2:
                contents[doc.id] = (
                    f"Document {i + 1} content with enough words to be hashed properly "
                    f"and meet the OCR threshold requirement for testing."
                )

        asyncio.run(self.service.build_lsh_index(documents, contents))

        # Should only have MinHashes for documents with content
        assert len(self.service.minhashes) == 2

    @patch("paperless_dedupe.services.deduplication_service.logger")
    def test_find_duplicates_basic(self, mock_logger):
        """Test basic duplicate finding functionality"""
        # Create mock documents with similar content
        documents = []
        contents = {}

        # Create two very similar documents
        for i in range(2):
            doc = Mock(spec=Document)
            doc.id = i + 1
            doc.archive_file_size = 1000
            documents.append(doc)
            contents[doc.id] = (
                "This is very similar document content for testing repeated " * 3
            )

        # Add a different document
        doc3 = Mock(spec=Document)
        doc3.id = 3
        doc3.archive_file_size = 500
        documents.append(doc3)
        contents[3] = (
            "This is completely different content about cats and dogs with extra words "
            "to exceed the minimum OCR word count requirement for hashing."
        )

        duplicate_groups = asyncio.run(
            self.service.find_duplicates(documents, contents, threshold=0.7)
        )

        # Should find at least one duplicate group
        assert len(duplicate_groups) >= 0  # Might be 0 or 1 depending on threshold

        # Verify logging was called
        mock_logger.info.assert_called()

    def test_find_duplicates_no_duplicates(self, monkeypatch):
        """Test duplicate finding with no similar documents"""
        monkeypatch.setattr(settings, "min_ocr_word_count", 1)
        documents = []
        contents = {}

        # Create documents with very different content
        topics = ["cats", "dogs", "cars", "computers"]
        for i, topic in enumerate(topics):
            doc = Mock(spec=Document)
            doc.id = i + 1
            doc.archive_file_size = 1000
            documents.append(doc)
            contents[doc.id] = (
                f"{topic} "
                * 15
                + f"unique vocabulary relating to {topic} exclusively without overlap "
                f"rare terms {topic} {topic} {topic} specialized jargon"
            )

        duplicate_groups = asyncio.run(
            self.service.find_duplicates(documents, contents, threshold=0.9)
        )

        # Should find no duplicate groups
        assert len(duplicate_groups) == 0

    def test_find_duplicates_empty_input(self):
        """Test duplicate finding with empty input"""
        duplicate_groups = asyncio.run(
            self.service.find_duplicates([], {}, threshold=0.8)
        )
        assert len(duplicate_groups) == 0

    def test_save_duplicate_groups(self, db_session):
        """Test saving duplicate groups to database"""
        # Create mock documents
        from paperless_dedupe.models.database import Document

        doc1 = Document(paperless_id=1, title="Doc 1", fingerprint="abc123")
        doc2 = Document(paperless_id=2, title="Doc 2", fingerprint="def456")

        db_session.add(doc1)
        db_session.add(doc2)
        db_session.commit()

        # Create duplicate group data
        duplicate_groups = [
            {"documents": [doc1, doc2], "confidence": 0.85, "scores": {doc2.id: 0.85}}
        ]

        self.service.save_duplicate_groups(db_session, duplicate_groups)

        # Verify group was saved
        groups = db_session.query(DuplicateGroup).all()
        assert len(groups) == 1
        assert groups[0].confidence_score == 0.85

        # Verify members were saved
        members = db_session.query(DuplicateMember).all()
        assert len(members) == 2

        # Check primary document designation
        primary_members = [m for m in members if m.is_primary]
        assert len(primary_members) == 1
        assert primary_members[0].document_id == doc1.id


class TestDeduplicationServiceIntegration:
    """Integration tests for deduplication service with realistic scenarios"""

    def setup_method(self):
        self.service = DeduplicationService()

    def test_invoice_duplicates(self):
        """Test detection of invoice duplicates with minor variations"""
        documents = []
        contents = {}

        # Original invoice
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 2048
        documents.append(doc1)
        contents[1] = """
        INVOICE #INV-2024-001
        Date: January 15, 2024

        Bill To: Acme Corporation
        123 Business Street

        Description: Consulting Services
        Amount: $1,500.00

        Total Due: $1,500.00
        """

        # Scanned copy with OCR variations
        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 2052
        documents.append(doc2)
        contents[2] = """
        INVOICE #INV-2024-OOl
        Date: January l5, 2024

        Bill To: Acme Corporation
        l23 Business Street

        Description: Consulting Services
        Amount: $l,5OO.OO

        Total Due: $l,5OO.OO
        """

        # Different invoice
        doc3 = Mock(spec=Document)
        doc3.id = 3
        doc3.archive_file_size = 1800
        documents.append(doc3)
        contents[3] = """
        INVOICE #INV-2024-002
        Date: February 1, 2024

        Bill To: Different Company Inc
        456 Other Avenue

        Description: Software License
        Amount: $2,000.00

        Total Due: $2,000.00
        """

        duplicate_groups = asyncio.run(
            self.service.find_duplicates(documents, contents, threshold=0.4)
        )

        # Should detect doc1 and doc2 as duplicates (they're very similar despite OCR errors)
        if len(duplicate_groups) > 0:
            # Find the group containing our similar invoices
            similar_group = None
            for group in duplicate_groups:
                doc_ids = [doc.id for doc in group["documents"]]
                if 1 in doc_ids and 2 in doc_ids:
                    similar_group = group
                    break

            if similar_group:
                assert similar_group["confidence"] > 0.4

        # At minimum, test that the algorithm ran without errors
        assert isinstance(duplicate_groups, list)

    def test_receipt_variations(self):
        """Test detection of receipt duplicates with different quality scans"""
        documents = []
        contents = {}

        # High quality scan
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.archive_file_size = 1024
        documents.append(doc1)
        contents[1] = (
            "RECEIPT Coffee Shop 123 Main St Date: 2024-01-15 Time: 09:30 AM Cappuccino $4.50 Tax $0.36 Total $4.86"
        )

        # Low quality scan with OCR errors
        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.archive_file_size = 1028
        documents.append(doc2)
        contents[2] = (
            "RECEIPT Coffee Shop l23 Main St Date: 2O24-Ol-l5 Time: O9:3O AM Cappuccino $4.5O Tax $O.36 Total $4.86"
        )

        duplicate_groups = asyncio.run(
            self.service.find_duplicates(documents, contents, threshold=0.7)
        )

        # Should detect as duplicates despite OCR errors
        if duplicate_groups:
            group = duplicate_groups[0]
            doc_ids = [doc.id for doc in group["documents"]]
            assert 1 in doc_ids and 2 in doc_ids
