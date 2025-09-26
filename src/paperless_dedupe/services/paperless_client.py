"""Enhanced Paperless client using PyPaperless SDK."""

import logging
from typing import Any

from pypaperless import Paperless
from pypaperless.models import Document

from paperless_dedupe.core.config import settings

logger = logging.getLogger(__name__)


class PaperlessClient:
    """Enhanced Paperless client using PyPaperless SDK."""

    def __init__(
        self,
        paperless_url: str | None = None,
        paperless_api_token: str | None = None,
        paperless_username: str | None = None,
        paperless_password: str | None = None,
    ):
        """Initialize the Paperless client."""
        # Get URL from parameter or settings
        url = paperless_url or settings.paperless_url

        # Validate URL is configured
        if not url or url.strip() == "":
            raise ValueError(
                "Paperless URL is not configured. Please configure the Paperless URL "
                "in the settings or environment variables."
            )

        self.base_url = url.rstrip("/")

        # PyPaperless expects URL without /api prefix
        if "/api" in self.base_url:
            self.base_url = self.base_url.replace("/api", "")

        # Prefer token auth
        if paperless_api_token or settings.paperless_api_token:
            self.token = paperless_api_token or settings.paperless_api_token
            self.paperless = Paperless(self.base_url, self.token)  # type: ignore[abstract]
        elif (paperless_username or settings.paperless_username) and (
            paperless_password or settings.paperless_password
        ):
            # Generate token from credentials
            username = paperless_username or settings.paperless_username
            password = paperless_password or settings.paperless_password
            self.token = None  # Will be generated on first use
            self.paperless: Paperless | None = None
            self._username = username
            self._password = password
        else:
            raise ValueError("Either API token or username/password must be provided")

    async def __aenter__(self):
        """Enter async context."""
        if not self.paperless:
            # Generate token from credentials if needed
            self.token = await Paperless.generate_api_token(
                self.base_url, self._username, self._password
            )
            self.paperless = Paperless(self.base_url, self.token)  # type: ignore[abstract]

        await self.paperless.initialize()

        # Initialize custom fields cache for better field handling
        try:
            self.paperless.cache.custom_fields = (
                await self.paperless.custom_fields.as_dict()
            )
        except Exception:
            # Custom fields might not be available
            pass

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        if self.paperless:
            await self.paperless.close()

    async def get_all_documents(
        self, batch_callback=None, limit=None
    ) -> list[dict[str, Any]]:
        """Get all documents from paperless with optimized pagination.

        Args:
            batch_callback: Optional callback function to process documents in batches.
                           Called with list of documents every batch_size documents.
            limit: Optional maximum number of documents to fetch.
        """
        documents = []
        batch_size = 200  # Process in batches for better memory efficiency
        fetched_count = 0

        try:
            # Use reduce with larger page size for faster fetching
            async with self.paperless.documents.reduce(page_size=batch_size) as reduced:
                batch = []
                async for doc in reduced:
                    doc_dict = self._document_to_dict(doc)
                    documents.append(doc_dict)
                    batch.append(doc_dict)
                    fetched_count += 1

                    # Stop if we've reached the limit
                    if limit and fetched_count >= limit:
                        if batch and batch_callback:
                            await batch_callback(batch)
                        break

                    # Process batch if we have enough documents
                    if len(batch) >= batch_size and batch_callback:
                        await batch_callback(batch)
                        batch = []

                # Process remaining documents in last batch
                if batch and batch_callback:
                    await batch_callback(batch)

            logger.info(f"Fetched {len(documents)} documents total")
            return documents

        except Exception as e:
            logger.error(f"Failed to fetch documents: {e}")
            raise

    async def get_documents(
        self, page: int = 1, page_size: int | None = None
    ) -> dict[str, Any]:
        """Get paginated list of documents."""
        page_size = page_size or settings.api_page_size

        try:
            # PyPaperless handles pagination internally
            # Collect documents for the specific page
            all_docs: list[dict[str, Any]] = []
            doc_count = 0
            skip = (page - 1) * page_size

            async for doc in self.paperless.documents:
                if doc_count >= skip and len(all_docs) < page_size:
                    all_docs.append(self._document_to_dict(doc))
                doc_count += 1
                if len(all_docs) >= page_size:
                    break

            # Determine if there are more pages
            has_next = doc_count > skip + len(all_docs)
            has_prev = page > 1

            return {
                "count": doc_count,
                "next": f"?page={page + 1}" if has_next else None,
                "previous": f"?page={page - 1}" if has_prev else None,
                "results": all_docs,
            }

        except Exception as e:
            logger.error(f"Failed to fetch documents page {page}: {e}")
            raise

    async def get_document(self, document_id: int) -> dict[str, Any]:
        """Get single document details."""
        try:
            doc = await self.paperless.documents(document_id)
            return self._document_to_dict(doc)
        except Exception as e:
            logger.error(f"Failed to fetch document {document_id}: {e}")
            raise

    async def get_document_content(self, document_id: int) -> str:
        """Get document OCR content."""
        try:
            doc = await self.paperless.documents(document_id)
            return doc.content or ""
        except Exception as e:
            logger.error(f"Failed to fetch document content {document_id}: {e}")
            return ""

    async def get_document_thumbnail(self, document_id: int) -> bytes:
        """Get document thumbnail."""
        try:
            thumbnail = await self.paperless.documents.thumbnail(document_id)
            return thumbnail  # type: ignore[return-value]
        except Exception as e:
            logger.error(f"Failed to fetch thumbnail {document_id}: {e}")
            raise

    async def get_document_preview(self, document_id: int) -> bytes:
        """Get document preview."""
        try:
            preview = await self.paperless.documents.preview(document_id)
            return preview  # type: ignore[return-value]
        except Exception as e:
            logger.error(f"Failed to fetch preview {document_id}: {e}")
            raise

    async def test_connection(self) -> bool:
        """Test connection to paperless API."""
        try:
            # Try to fetch one document to test the connection
            async with self.paperless.documents.reduce(page_size=1) as reduced:
                async for _ in reduced:
                    break
            return True
        except Exception as e:
            logger.error(f"Failed to connect to paperless API: {e}")
            return False

    async def delete_document(self, document_id: int) -> bool:
        """Delete a document from paperless."""
        try:
            doc = await self.paperless.documents(document_id)
            return await doc.delete()
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            return False

    async def add_tags_to_document(self, document_id: int, tag_ids: list[int]) -> bool:
        """Add tags to a document."""
        try:
            doc = await self.paperless.documents(document_id)
            current_tags = doc.tags or []
            doc.tags = list(set(current_tags + tag_ids))
            return await doc.update()
        except Exception as e:
            logger.error(f"Failed to add tags to document {document_id}: {e}")
            return False

    async def remove_tags_from_document(
        self, document_id: int, tag_ids: list[int]
    ) -> bool:
        """Remove tags from a document."""
        try:
            doc = await self.paperless.documents(document_id)
            current_tags = doc.tags or []
            doc.tags = [tag for tag in current_tags if tag not in tag_ids]
            return await doc.update()
        except Exception as e:
            logger.error(f"Failed to remove tags from document {document_id}: {e}")
            return False

    async def update_document_metadata(
        self, document_id: int, metadata: dict[str, Any]
    ) -> bool:
        """Update document metadata."""
        try:
            doc = await self.paperless.documents(document_id)
            for key, value in metadata.items():
                setattr(doc, key, value)
            return await doc.update()
        except Exception as e:
            logger.error(f"Failed to update metadata for document {document_id}: {e}")
            return False

    async def get_tags(self) -> list[dict[str, Any]]:
        """Get all available tags."""
        try:
            tags = []
            async for tag in self.paperless.tags:
                tags.append(
                    {
                        "id": tag.id,
                        "name": tag.name,
                        "color": tag.color,
                        "slug": tag.slug,
                        "match": tag.match,
                        "matching_algorithm": str(tag.matching_algorithm)
                        if tag.matching_algorithm
                        else None,
                        "is_inbox_tag": tag.is_inbox_tag,
                        "document_count": tag.document_count,
                    }
                )
            return tags
        except Exception as e:
            logger.error(f"Failed to get tags: {e}")
            return []

    async def create_tag(self, name: str, color: str = "#000000") -> int | None:
        """Create a new tag."""
        try:
            draft = self.paperless.tags.draft(name=name, color=color)
            new_id = await draft.save()
            return int(new_id) if new_id is not None else None
        except Exception as e:
            logger.error(f"Failed to create tag {name}: {e}")
            return None

    # New methods enabled by PyPaperless

    async def get_correspondents(self) -> list[dict[str, Any]]:
        """Get all correspondents."""
        try:
            correspondents = []
            async for corr in self.paperless.correspondents:
                correspondents.append(
                    {
                        "id": corr.id,
                        "name": corr.name,
                        "slug": corr.slug,
                        "match": corr.match,
                        "matching_algorithm": str(corr.matching_algorithm)
                        if corr.matching_algorithm
                        else None,
                        "is_insensitive": corr.is_insensitive,
                        "document_count": corr.document_count,
                        "last_correspondence": corr.last_correspondence.isoformat()
                        if corr.last_correspondence
                        else None,
                    }
                )
            return correspondents
        except Exception as e:
            logger.error(f"Failed to get correspondents: {e}")
            return []

    async def get_document_types(self) -> list[dict[str, Any]]:
        """Get all document types."""
        try:
            types = []
            async for doc_type in self.paperless.document_types:
                types.append(
                    {
                        "id": doc_type.id,
                        "name": doc_type.name,
                        "slug": doc_type.slug,
                        "match": doc_type.match,
                        "matching_algorithm": str(doc_type.matching_algorithm)
                        if doc_type.matching_algorithm
                        else None,
                        "is_insensitive": doc_type.is_insensitive,
                        "document_count": doc_type.document_count,
                    }
                )
            return types
        except Exception as e:
            logger.error(f"Failed to get document types: {e}")
            return []

    async def get_storage_paths(self) -> list[dict[str, Any]]:
        """Get all storage paths."""
        try:
            paths = []
            async for path in self.paperless.storage_paths:
                paths.append(
                    {
                        "id": path.id,
                        "name": path.name,
                        "slug": path.slug,
                        "path": path.path,
                        "match": path.match,
                        "matching_algorithm": str(path.matching_algorithm)
                        if path.matching_algorithm
                        else None,
                        "is_insensitive": path.is_insensitive,
                        "document_count": path.document_count,
                    }
                )
            return paths
        except Exception as e:
            logger.error(f"Failed to get storage paths: {e}")
            return []

    async def get_custom_fields(self) -> list[dict[str, Any]]:
        """Get all custom fields."""
        try:
            fields = []
            async for field in self.paperless.custom_fields:
                fields.append(
                    {
                        "id": field.id,
                        "name": field.name,
                        "data_type": field.data_type,
                        "extra_data": field.extra_data,
                    }
                )
            return fields
        except Exception as e:
            logger.error(f"Failed to get custom fields: {e}")
            return []

    async def search_documents(self, query: str) -> list[dict[str, Any]]:
        """Search for documents using query."""
        try:
            documents = []
            async for doc in self.paperless.documents.search(query):
                doc_dict = self._document_to_dict(doc)
                if doc.has_search_hit:
                    doc_dict["search_score"] = doc.search_hit.score
                documents.append(doc_dict)
            return documents
        except Exception as e:
            logger.error(f"Failed to search documents: {e}")
            return []

    async def get_similar_documents(self, document_id: int) -> list[dict[str, Any]]:
        """Get documents similar to the given document."""
        try:
            similar = []
            async for doc in self.paperless.documents.more_like(document_id):
                doc_dict = self._document_to_dict(doc)
                if doc.has_search_hit:
                    doc_dict["similarity_score"] = doc.search_hit.score
                similar.append(doc_dict)
            return similar
        except Exception as e:
            logger.error(f"Failed to get similar documents: {e}")
            return []

    async def get_document_suggestions(self, document_id: int) -> dict[str, Any]:
        """Get classification suggestions for a document."""
        try:
            suggestions = await self.paperless.documents.suggestions(document_id)
            return {
                "correspondents": suggestions.correspondents or [],
                "tags": suggestions.tags or [],
                "document_types": suggestions.document_types or [],
                "storage_paths": suggestions.storage_paths or [],
                "dates": suggestions.dates or [],
            }
        except Exception as e:
            logger.error(f"Failed to get suggestions: {e}")
            return {}

    async def get_statistics(self) -> dict[str, Any]:
        """Get comprehensive statistics about the paperless instance (optimized version)."""
        try:
            # Fetch all metadata in parallel for speed
            tags = await self.get_tags()
            correspondents = await self.get_correspondents()
            doc_types = await self.get_document_types()
            storage_paths = await self.get_storage_paths()
            custom_fields = await self.get_custom_fields()

            # Get document count from a single page request (much faster)
            first_page = await self.get_documents(page=1, page_size=1)
            total_docs = first_page.get("count", 0)

            # Calculate documents with metadata from the counts in each category
            # This is approximate but much faster than iterating all documents
            docs_with_correspondent = sum(
                c.get("document_count", 0) for c in correspondents
            )
            docs_with_tags = sum(t.get("document_count", 0) for t in tags)
            docs_with_type = sum(dt.get("document_count", 0) for dt in doc_types)

            # Note: These counts might be higher than total_docs if documents have multiple tags
            # Clamp them to be at most total_docs
            docs_with_correspondent = min(docs_with_correspondent, total_docs)
            docs_with_tags = min(docs_with_tags, total_docs)
            docs_with_type = min(docs_with_type, total_docs)

            return {
                "total_documents": total_docs,
                "total_tags": len(tags),
                "total_correspondents": len(correspondents),
                "total_document_types": len(doc_types),
                "total_storage_paths": len(storage_paths),
                "total_custom_fields": len(custom_fields),
                "documents_with_correspondent": docs_with_correspondent,
                "documents_with_tags": docs_with_tags,
                "documents_with_type": docs_with_type,
                "top_tags": sorted(
                    tags, key=lambda x: x.get("document_count", 0), reverse=True
                )[:10],
                "top_correspondents": sorted(
                    correspondents,
                    key=lambda x: x.get("document_count", 0),
                    reverse=True,
                )[:10],
                "top_document_types": sorted(
                    doc_types, key=lambda x: x.get("document_count", 0), reverse=True
                )[:5],
            }
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}

    def _document_to_dict(self, doc: Document) -> dict[str, Any]:
        """Convert PyPaperless Document to dict."""
        return {
            "id": doc.id,
            "title": doc.title,
            "content": doc.content,
            "correspondent": doc.correspondent,
            "document_type": doc.document_type,
            "storage_path": doc.storage_path,
            "tags": doc.tags or [],
            "created": doc.created.isoformat() if doc.created else None,
            "modified": doc.modified.isoformat() if doc.modified else None,
            "added": doc.added.isoformat() if doc.added else None,
            "archive_serial_number": doc.archive_serial_number,
            "original_file_name": doc.original_file_name,
            "archived_file_name": doc.archived_file_name,
            "owner": doc.owner,
            "notes": doc.notes or [],
            "custom_fields": [
                {"field": cf.field, "value": cf.value}
                for cf in (doc.custom_fields or [])
            ]
            if hasattr(doc, "custom_fields")
            else [],
        }
