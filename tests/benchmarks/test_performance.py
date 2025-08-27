"""
Performance benchmarks for the deduplication system
"""

import pytest
import time
import psutil
import os
from unittest.mock import Mock
from typing import List, Dict

from paperless_dedupe.services.deduplication_service import DeduplicationService
from paperless_dedupe.models.database import Document


@pytest.mark.benchmark
@pytest.mark.skip(
    reason="Performance tests are resource intensive - run manually with pytest -m benchmark"
)
class TestDeduplicationPerformance:
    """Performance benchmarks for deduplication algorithms"""

    def setup_method(self):
        """Setup for each benchmark"""
        self.service = DeduplicationService()
        self.process = psutil.Process(os.getpid())

    def _create_test_documents(self, count: int) -> tuple[List[Mock], Dict[int, str]]:
        """Create test documents for benchmarking"""
        documents = []
        contents = {}

        base_texts = [
            "This is a financial document with accounting information and transaction details",
            "Medical record containing patient information and treatment history details",
            "Legal contract with terms and conditions for service agreements",
            "Invoice document with billing information and payment terms",
            "Receipt for purchase with itemized list and total amounts",
        ]

        for i in range(count):
            doc = Mock(spec=Document)
            doc.id = i + 1
            doc.file_size = 1024 + (i % 1000)
            documents.append(doc)

            # Create variations of base texts to simulate real documents
            base_idx = i % len(base_texts)
            content = f"{base_texts[base_idx]} Document ID: {i + 1} Additional content: {i * 13 % 100}"

            # Every 20th document is a near-duplicate
            if i % 20 == 1:
                content = base_texts[base_idx] + f" Near duplicate variation {i // 20}"

            contents[doc.id] = content

        return documents, contents

    def _measure_memory_usage(self) -> float:
        """Get current memory usage in MB"""
        return self.process.memory_info().rss / 1024 / 1024

    @pytest.mark.parametrize("doc_count", [100, 500, 1000])
    def test_minhash_generation_performance(self, doc_count):
        """Benchmark MinHash generation performance"""
        documents, contents = self._create_test_documents(doc_count)

        # Measure memory before
        memory_before = self._measure_memory_usage()

        # Benchmark MinHash generation
        start_time = time.time()

        for doc in documents:
            if doc.id in contents:
                minhash = self.service.create_minhash(contents[doc.id])
                assert minhash is not None

        end_time = time.time()

        # Measure memory after
        memory_after = self._measure_memory_usage()

        # Calculate metrics
        total_time = end_time - start_time
        docs_per_second = doc_count / total_time
        memory_used = memory_after - memory_before

        print(f"\nMinHash Generation Performance ({doc_count} documents):")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Documents/second: {docs_per_second:.1f}")
        print(f"  Memory used: {memory_used:.1f} MB")
        print(f"  Time per document: {(total_time * 1000 / doc_count):.2f}ms")

        # Performance assertions
        assert docs_per_second > 50, (
            f"MinHash generation too slow: {docs_per_second:.1f} docs/sec"
        )
        assert memory_used < doc_count * 0.1, (
            f"Memory usage too high: {memory_used:.1f} MB"
        )

    @pytest.mark.parametrize("doc_count", [100, 500, 1000])
    def test_lsh_index_building_performance(self, doc_count):
        """Benchmark LSH index building performance"""
        documents, contents = self._create_test_documents(doc_count)

        memory_before = self._measure_memory_usage()
        start_time = time.time()

        # Build LSH index
        self.service.build_lsh_index(documents, contents)

        end_time = time.time()
        memory_after = self._measure_memory_usage()

        total_time = end_time - start_time
        docs_per_second = doc_count / total_time
        memory_used = memory_after - memory_before

        print(f"\nLSH Index Building Performance ({doc_count} documents):")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Documents/second: {docs_per_second:.1f}")
        print(f"  Memory used: {memory_used:.1f} MB")
        print(f"  Index size: {len(self.service.minhashes)} MinHashes")

        # Performance assertions
        assert docs_per_second > 20, (
            f"LSH indexing too slow: {docs_per_second:.1f} docs/sec"
        )
        assert len(self.service.minhashes) > 0, "No MinHashes created"

    @pytest.mark.parametrize("doc_count", [100, 500, 1000])
    def test_duplicate_finding_performance(self, doc_count):
        """Benchmark complete duplicate finding performance"""
        documents, contents = self._create_test_documents(doc_count)

        memory_before = self._measure_memory_usage()
        start_time = time.time()

        # Find duplicates
        duplicate_groups = self.service.find_duplicates(
            documents, contents, threshold=0.7
        )

        end_time = time.time()
        memory_after = self._measure_memory_usage()

        total_time = end_time - start_time
        docs_per_second = doc_count / total_time
        memory_used = memory_after - memory_before

        print(f"\nDuplicate Finding Performance ({doc_count} documents):")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Documents/second: {docs_per_second:.1f}")
        print(f"  Memory used: {memory_used:.1f} MB")
        print(f"  Duplicate groups found: {len(duplicate_groups)}")

        # Performance assertions
        assert docs_per_second > 10, (
            f"Duplicate finding too slow: {docs_per_second:.1f} docs/sec"
        )
        assert total_time < doc_count * 0.1, (
            f"Time complexity seems O(n²): {total_time:.2f}s for {doc_count} docs"
        )

    def test_memory_scaling(self):
        """Test memory usage scaling with document count"""
        memory_usage = []
        doc_counts = [100, 200, 500, 1000]

        for count in doc_counts:
            documents, contents = self._create_test_documents(count)

            memory_before = self._measure_memory_usage()
            self.service.build_lsh_index(documents, contents)
            memory_after = self._measure_memory_usage()

            memory_used = memory_after - memory_before
            memory_usage.append(memory_used)

            print(
                f"Documents: {count}, Memory: {memory_used:.1f} MB, Per doc: {memory_used / count:.3f} MB"
            )

            # Clear for next iteration
            self.service.minhashes.clear()
            self.service.lsh_index._hashtables = [
                dict() for _ in range(self.service.lsh_index.b)
            ]

        # Check that memory usage is roughly linear
        for i in range(1, len(memory_usage)):
            ratio = memory_usage[i] / memory_usage[i - 1]
            doc_ratio = doc_counts[i] / doc_counts[i - 1]

            # Memory growth should be roughly proportional to document growth
            assert ratio < doc_ratio * 1.5, (
                f"Memory scaling too steep: {ratio:.2f}x for {doc_ratio:.2f}x docs"
            )

    def test_similarity_calculation_performance(self):
        """Benchmark similarity calculation performance"""
        # Create test documents
        doc1 = Mock(spec=Document)
        doc1.id = 1
        doc1.file_size = 1024

        doc2 = Mock(spec=Document)
        doc2.id = 2
        doc2.file_size = 1024

        # Test texts of varying lengths
        text_lengths = [100, 500, 1000, 5000, 10000]

        for length in text_lengths:
            text1 = "test document content " * (length // 20)
            text2 = "test document content similar " * (length // 25)

            # Create MinHashes
            minhash1 = self.service.create_minhash(text1)
            minhash2 = self.service.create_minhash(text2)
            self.service.minhashes = {1: minhash1, 2: minhash2}

            # Benchmark similarity calculation
            start_time = time.time()
            iterations = 1000

            for _ in range(iterations):
                score = self.service.calculate_similarity_score(
                    doc1, doc2, text1, text2
                )

            end_time = time.time()

            avg_time = (end_time - start_time) / iterations * 1000  # ms

            print(f"Text length: {length}, Avg similarity calc time: {avg_time:.3f}ms")

            # Should be fast regardless of text length (due to truncation)
            assert avg_time < 10, f"Similarity calculation too slow: {avg_time:.3f}ms"

    @pytest.mark.slow
    def test_large_scale_performance(self):
        """Test performance with large document sets (marked as slow)"""
        doc_count = 2000  # Reduced from 5000 for CI performance
        documents, contents = self._create_test_documents(doc_count)

        print(f"\nLarge Scale Performance Test ({doc_count} documents):")

        # Test complete pipeline
        start_time = time.time()
        memory_before = self._measure_memory_usage()

        duplicate_groups = self.service.find_duplicates(
            documents, contents, threshold=0.8
        )

        end_time = time.time()
        memory_after = self._measure_memory_usage()

        total_time = end_time - start_time
        memory_used = memory_after - memory_before

        print(f"  Total time: {total_time:.2f}s")
        print(f"  Documents/second: {doc_count / total_time:.1f}")
        print(f"  Memory used: {memory_used:.1f} MB")
        print(f"  Memory per document: {memory_used / doc_count:.3f} MB")
        print(f"  Duplicate groups found: {len(duplicate_groups)}")

        # Performance targets for large scale
        assert total_time < doc_count * 0.05, "Large scale processing too slow"
        assert memory_used < doc_count * 0.05, "Memory usage too high for large scale"


@pytest.mark.benchmark
@pytest.mark.skip(
    reason="Performance tests are resource intensive - run manually with pytest -m benchmark"
)
class TestDatabasePerformance:
    """Performance benchmarks for database operations"""

    def test_document_insertion_performance(self, db_session):
        """Benchmark document insertion performance"""
        from paperless_dedupe.models.database import Document, DocumentContent

        doc_count = 1000

        start_time = time.time()

        # Batch insert documents
        documents = []
        for i in range(doc_count):
            doc = Document(
                paperless_id=1000 + i,
                title=f"Perf Test Doc {i}",
                fingerprint=f"perf_fp_{i}",
                file_size=1024 + i,
            )
            documents.append(doc)

        db_session.add_all(documents)
        db_session.commit()

        end_time = time.time()

        total_time = end_time - start_time
        docs_per_second = doc_count / total_time

        print(f"\nDocument Insertion Performance:")
        print(f"  {doc_count} documents in {total_time:.2f}s")
        print(f"  Rate: {docs_per_second:.1f} docs/second")

        assert docs_per_second > 100, (
            f"Database insertion too slow: {docs_per_second:.1f} docs/sec"
        )

    def test_duplicate_group_query_performance(self, db_session):
        """Benchmark duplicate group queries"""
        from paperless_dedupe.models.database import (
            Document,
            DuplicateGroup,
            DuplicateMember,
        )

        # Create test data
        group_count = 100

        # Create documents
        for i in range(group_count * 3):
            doc = Document(
                paperless_id=2000 + i,
                title=f"Query Test Doc {i}",
                fingerprint=f"query_fp_{i}",
            )
            db_session.add(doc)
        db_session.flush()

        # Create duplicate groups
        for i in range(group_count):
            group = DuplicateGroup(confidence_score=0.8 + (i % 20) * 0.01)
            db_session.add(group)
            db_session.flush()

            # Add members to group
            for j in range(3):
                doc_idx = i * 3 + j
                member = DuplicateMember(
                    group_id=group.id, document_id=doc_idx + 1, is_primary=(j == 0)
                )
                db_session.add(member)

        db_session.commit()

        # Benchmark queries
        start_time = time.time()
        iterations = 100

        for _ in range(iterations):
            # Query all duplicate groups with documents
            groups = db_session.query(DuplicateGroup).all()
            for group in groups[:10]:  # Limit to first 10 for timing
                _ = [member.document for member in group.members]

        end_time = time.time()

        avg_time = (end_time - start_time) / iterations * 1000  # ms

        print(f"\nDuplicate Group Query Performance:")
        print(f"  Average query time: {avg_time:.2f}ms")
        print(f"  Groups queried: {len(groups)}")

        assert avg_time < 100, f"Duplicate group queries too slow: {avg_time:.2f}ms"


@pytest.mark.benchmark
@pytest.mark.skip(
    reason="Performance tests are resource intensive - run manually with pytest -m benchmark"
)
class TestCachePerformance:
    """Performance benchmarks for caching operations"""

    async def test_cache_operations_performance(self, mock_cache):
        """Benchmark cache read/write performance"""
        doc_count = 1000

        # Test cache writes
        start_time = time.time()

        for i in range(doc_count):
            await mock_cache.set_document_metadata(
                i, {"title": f"Doc {i}", "size": 1024 + i, "created": "2024-01-01"}
            )

        write_time = time.time() - start_time

        # Test cache reads
        start_time = time.time()

        for i in range(doc_count):
            metadata = await mock_cache.get_document_metadata(i)
            assert metadata is not None

        read_time = time.time() - start_time

        print(f"\nCache Performance ({doc_count} operations):")
        print(f"  Write time: {write_time:.2f}s ({doc_count / write_time:.1f} ops/sec)")
        print(f"  Read time: {read_time:.2f}s ({doc_count / read_time:.1f} ops/sec)")

        # Cache operations should be very fast
        assert doc_count / write_time > 1000, (
            f"Cache writes too slow: {doc_count / write_time:.1f} ops/sec"
        )
        assert doc_count / read_time > 1000, (
            f"Cache reads too slow: {doc_count / read_time:.1f} ops/sec"
        )
