import base64
import hashlib
import json
import logging
from datetime import datetime
from typing import Any, TypeVar

from cryptography.fernet import Fernet
from pydantic import BaseModel
from sqlalchemy.orm import Query

from paperless_dedupe.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _derive_fernet_key(secret_key: str) -> bytes:
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class PaginationCursor:
    """Secure pagination cursor implementation using encrypted tokens"""

    def __init__(self):
        # Use secret key from settings for encryption
        self.cipher = Fernet(_derive_fernet_key(settings.secret_key))

    def encode(self, data: dict) -> str:
        """Encode cursor data into an encrypted token"""
        try:
            json_data = json.dumps(data, default=str)
            encrypted = self.cipher.encrypt(json_data.encode())
            return base64.urlsafe_b64encode(encrypted).decode("utf-8")
        except Exception as e:
            logger.error(f"Error encoding cursor: {e}")
            raise ValueError("Failed to encode cursor") from e

    def decode(self, cursor: str) -> dict:
        """Decode cursor token into data"""
        try:
            encrypted = base64.urlsafe_b64decode(cursor.encode())
            decrypted = self.cipher.decrypt(encrypted)
            return json.loads(decrypted.decode())
        except Exception as e:
            logger.error(f"Error decoding cursor: {e}")
            raise ValueError("Invalid cursor token") from e


class CursorPaginatedResponse(BaseModel):
    """Response model for cursor-paginated results"""

    results: list[Any]
    count: int
    next_cursor: str | None = None
    prev_cursor: str | None = None
    has_next: bool = False
    has_prev: bool = False


def apply_cursor_pagination(
    query: Query,
    cursor: str | None = None,
    limit: int = 100,
    order_by_field: str = "id",
    order_desc: bool = False,
) -> tuple[list[Any], dict]:
    """Apply cursor-based pagination to a query.

    Args:
        query: SQLAlchemy query object
        cursor: Encrypted cursor token for pagination
        limit: Number of results per page
        order_by_field: Field to order by (must be unique or combined with ID)
        order_desc: Whether to order descending

    Returns:
        Tuple of (results, pagination_info)
    """
    cursor_handler = PaginationCursor()

    # Decode cursor if provided
    cursor_data = None
    if cursor:
        try:
            cursor_data = cursor_handler.decode(cursor)
        except ValueError:
            # Invalid cursor, ignore and start from beginning
            logger.warning("Invalid cursor provided, starting from beginning")

    # Apply cursor filter if we have cursor data
    if cursor_data:
        last_id = cursor_data.get("last_id")
        last_value = cursor_data.get("last_value")

        # Get the model from the query
        model = query.column_descriptions[0]["type"]

        if last_id and hasattr(model, order_by_field):
            order_field = getattr(model, order_by_field)

            if order_desc:
                # For descending order
                if last_value is not None:
                    # Use composite key comparison for stable pagination
                    query = query.filter(
                        (order_field < last_value)
                        | ((order_field == last_value) & (model.id < last_id))
                    )
                else:
                    query = query.filter(model.id < last_id)
            else:
                # For ascending order
                if last_value is not None:
                    # Use composite key comparison for stable pagination
                    query = query.filter(
                        (order_field > last_value)
                        | ((order_field == last_value) & (model.id > last_id))
                    )
                else:
                    query = query.filter(model.id > last_id)

    # Apply ordering
    model = query.column_descriptions[0]["type"]
    if hasattr(model, order_by_field):
        order_field = getattr(model, order_by_field)
        if order_desc:
            query = query.order_by(order_field.desc(), model.id.desc())
        else:
            query = query.order_by(order_field.asc(), model.id.asc())
    else:
        # Fallback to ID ordering
        if order_desc:
            query = query.order_by(model.id.desc())
        else:
            query = query.order_by(model.id.asc())

    # Fetch one extra result to check if there's a next page
    results = query.limit(limit + 1).all()

    has_next = len(results) > limit
    if has_next:
        results = results[:limit]

    # Generate next cursor if there are more results
    next_cursor = None
    if has_next and results:
        last_result = results[-1]
        last_value = None
        if hasattr(last_result, order_by_field):
            last_value = getattr(last_result, order_by_field)
            # Convert datetime to string for JSON serialization
            if isinstance(last_value, datetime):
                last_value = last_value.isoformat()

        cursor_data = {
            "last_id": last_result.id,
            "last_value": last_value,
            "order_by": order_by_field,
            "order_desc": order_desc,
        }
        next_cursor = cursor_handler.encode(cursor_data)

    # Generate previous cursor (simplified - just indicates possibility)
    prev_cursor = cursor if cursor else None

    pagination_info = {
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_next": has_next,
        "has_prev": cursor is not None,
        "count": len(results),
    }

    return results, pagination_info


def create_offset_compatible_response(
    results: list[Any],
    pagination_info: dict,
    base_url: str,
    skip: int = 0,
    limit: int = 100,
) -> dict:
    """Create a response that's compatible with both cursor and offset pagination.

    This allows gradual migration from offset to cursor pagination.
    """
    response = {
        "results": results,
        "count": pagination_info["count"],
        "next_cursor": pagination_info.get("next_cursor"),
        "prev_cursor": pagination_info.get("prev_cursor"),
        "has_next": pagination_info.get("has_next", False),
        "has_prev": pagination_info.get("has_prev", False),
    }

    # Add offset-based URLs for backward compatibility
    if pagination_info.get("has_next"):
        response["next"] = f"{base_url}?skip={skip + limit}&limit={limit}"
    else:
        response["next"] = None

    if skip > 0:
        prev_skip = max(0, skip - limit)
        response["previous"] = f"{base_url}?skip={prev_skip}&limit={limit}"
    else:
        response["previous"] = None

    return response
