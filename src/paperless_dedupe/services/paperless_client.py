import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

from paperless_dedupe.core.config import settings

logger = logging.getLogger(__name__)


class PaperlessClient:
    def __init__(
        self,
        paperless_url: str | None = None,
        paperless_api_token: str | None = None,
        paperless_username: str | None = None,
        paperless_password: str | None = None,
    ):
        self.base_url = (paperless_url or settings.paperless_url).rstrip("/")
        self.token = (
            paperless_api_token
            if paperless_api_token is not None
            else settings.paperless_api_token
        )
        self.username = (
            paperless_username
            if paperless_username is not None
            else settings.paperless_username
        )
        self.password = (
            paperless_password
            if paperless_password is not None
            else settings.paperless_password
        )
        self.client = None
        self._token_cache = None
        self._token_expiry = None

    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            timeout=settings.api_timeout, headers=await self._get_headers()
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()

    async def _get_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json; version=9",
            "Content-Type": "application/json",
        }

        if self.token:
            headers["Authorization"] = f"Token {self.token}"
        elif self.username and self.password:
            token = await self._get_auth_token()
            headers["Authorization"] = f"Token {token}"

        return headers

    async def _get_auth_token(self) -> str:
        """Get authentication token using username/password"""
        if (
            self._token_cache
            and self._token_expiry
            and datetime.now() < self._token_expiry
        ):
            return self._token_cache

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/token/",
                json={"username": self.username, "password": self.password},
            )
            response.raise_for_status()
            data = response.json()
            self._token_cache = data["token"]
            self._token_expiry = datetime.now() + timedelta(hours=23)
            return self._token_cache

    async def _request_with_retry(
        self, method: str, url: str, **kwargs
    ) -> httpx.Response:
        """Make request with retry logic and rate limiting"""
        for attempt in range(settings.api_max_retries):
            try:
                response = await self.client.request(method, url, **kwargs)

                if response.status_code == 429:
                    # Rate limited, wait and retry
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"Rate limited, waiting {retry_after} seconds")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()
                return response

            except httpx.HTTPStatusError as e:
                if (
                    e.response.status_code >= 500
                    and attempt < settings.api_max_retries - 1
                ):
                    # Server error, exponential backoff
                    wait_time = 2**attempt
                    logger.warning(f"Server error, retrying in {wait_time} seconds")
                    await asyncio.sleep(wait_time)
                    continue
                raise
            except httpx.RequestError as e:
                if attempt < settings.api_max_retries - 1:
                    wait_time = 2**attempt
                    logger.warning(
                        f"Request error, retrying in {wait_time} seconds: {e}"
                    )
                    await asyncio.sleep(wait_time)
                    continue
                raise

        raise Exception(f"Max retries ({settings.api_max_retries}) exceeded")

    async def get_documents(
        self, page: int = 1, page_size: int = None
    ) -> dict[str, Any]:
        """Get paginated list of documents"""
        page_size = page_size or settings.api_page_size

        params = {"page": page, "page_size": page_size, "ordering": "-id"}

        response = await self._request_with_retry(
            "GET", f"{self.base_url}/api/documents/", params=params
        )

        return response.json()

    async def get_all_documents(self) -> list[dict[str, Any]]:
        """Get all documents from paperless (handles pagination)"""
        all_documents = []
        page = 1

        while True:
            logger.info(f"Fetching documents page {page}")
            data = await self.get_documents(page=page)

            all_documents.extend(data["results"])

            if not data["next"]:
                break

            page += 1
            # Small delay to avoid overwhelming the API
            await asyncio.sleep(0.1)

        logger.info(f"Fetched {len(all_documents)} documents total")
        return all_documents

    async def get_document(self, document_id: int) -> dict[str, Any]:
        """Get single document details"""
        response = await self._request_with_retry(
            "GET", f"{self.base_url}/api/documents/{document_id}/"
        )
        return response.json()

    async def get_document_content(self, document_id: int) -> str:
        """Get document OCR content"""
        response = await self._request_with_retry(
            "GET",
            f"{self.base_url}/api/documents/{document_id}/download/",
            params={"original": "false"},  # Get the archived version with OCR
        )

        # The API returns the actual PDF content, we need to extract text
        # For now, we'll use the document's content field from the document API
        doc = await self.get_document(document_id)
        return doc.get("content", "")

    async def get_document_thumbnail(self, document_id: int) -> bytes:
        """Get document thumbnail"""
        response = await self._request_with_retry(
            "GET", f"{self.base_url}/api/documents/{document_id}/thumb/"
        )
        return response.content

    async def get_document_preview(self, document_id: int) -> bytes:
        """Get document preview image"""
        response = await self._request_with_retry(
            "GET", f"{self.base_url}/api/documents/{document_id}/preview/"
        )
        return response.content

    async def test_connection(self) -> bool:
        """Test connection to paperless API"""
        try:
            # Use /api/documents/ endpoint with limit=1 to test connection
            # This is a proper endpoint that doesn't redirect
            response = await self._request_with_retry(
                "GET", f"{self.base_url}/api/documents/", params={"page_size": 1}
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to connect to paperless API: {e}")
            return False

    # Batch operations
    async def delete_document(self, document_id: int) -> bool:
        """Delete a document from paperless"""
        try:
            response = await self._request_with_retry(
                "DELETE", f"{self.base_url}/api/documents/{document_id}/"
            )
            return response.status_code in [200, 204]
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            return False

    async def add_tags_to_document(self, document_id: int, tag_ids: list[int]) -> bool:
        """Add tags to a document"""
        try:
            # First get current document to preserve existing data
            doc = await self.get_document(document_id)
            current_tags = doc.get("tags", [])

            # Add new tags
            updated_tags = list(set(current_tags + tag_ids))

            response = await self._request_with_retry(
                "PATCH",
                f"{self.base_url}/api/documents/{document_id}/",
                json={"tags": updated_tags},
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to add tags to document {document_id}: {e}")
            return False

    async def remove_tags_from_document(
        self, document_id: int, tag_ids: list[int]
    ) -> bool:
        """Remove tags from a document"""
        try:
            # First get current document
            doc = await self.get_document(document_id)
            current_tags = doc.get("tags", [])

            # Remove specified tags
            updated_tags = [tag for tag in current_tags if tag not in tag_ids]

            response = await self._request_with_retry(
                "PATCH",
                f"{self.base_url}/api/documents/{document_id}/",
                json={"tags": updated_tags},
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to remove tags from document {document_id}: {e}")
            return False

    async def update_document_metadata(
        self, document_id: int, metadata: dict[str, Any]
    ) -> bool:
        """Update document metadata"""
        try:
            response = await self._request_with_retry(
                "PATCH", f"{self.base_url}/api/documents/{document_id}/", json=metadata
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to update metadata for document {document_id}: {e}")
            return False

    async def get_tags(self) -> list[dict[str, Any]]:
        """Get all available tags"""
        try:
            response = await self._request_with_retry(
                "GET", f"{self.base_url}/api/tags/"
            )
            data = response.json()
            return data.get("results", [])
        except Exception as e:
            logger.error(f"Failed to get tags: {e}")
            return []

    async def create_tag(self, name: str, color: str = "#000000") -> int | None:
        """Create a new tag"""
        try:
            response = await self._request_with_retry(
                "POST",
                f"{self.base_url}/api/tags/",
                json={"name": name, "color": color},
            )
            if response.status_code == 201:
                return response.json().get("id")
            return None
        except Exception as e:
            logger.error(f"Failed to create tag {name}: {e}")
            return None
