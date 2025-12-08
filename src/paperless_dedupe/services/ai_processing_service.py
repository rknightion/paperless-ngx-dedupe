import json
import logging
from datetime import UTC, datetime
from typing import Any

from dateutil import parser as date_parser
from openai import AsyncOpenAI, OpenAI
from sqlalchemy.orm import Session

from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import (
    AIExtractionJob,
    AIExtractionResult,
    AppConfig,
    Document,
    DocumentContent,
)

logger = logging.getLogger(__name__)

ALLOWED_MODELS = {"gpt-5.1", "gpt-5-mini", "gpt-5-nano"}


class AIProcessingService:
    """Service responsible for preparing prompts, calling OpenAI, and persisting results."""

    def __init__(self, db: Session):
        self.db = db

    def _load_ai_settings(self) -> dict[str, Any]:
        """Load AI configuration from DB with settings fallback."""
        config_items = {item.key: item.value for item in self.db.query(AppConfig).all()}

        api_key = config_items.get("openai_api_key") or settings.openai_api_key
        if isinstance(api_key, str) and api_key.strip() == "":
            api_key = None

        if not api_key:
            raise ValueError("OpenAI API key is not configured")

        model = config_items.get("openai_model", settings.openai_model)
        if model not in ALLOWED_MODELS:
            model = settings.openai_model

        reasoning_effort = config_items.get(
            "openai_reasoning_effort", settings.openai_reasoning_effort
        )
        if isinstance(reasoning_effort, str):
            reasoning_effort = reasoning_effort.lower()
        if reasoning_effort not in {"low", "medium", "high"}:
            reasoning_effort = "medium"

        max_chars = config_items.get("ai_max_input_chars", settings.ai_max_input_chars)
        try:
            max_chars = int(max_chars)
        except (TypeError, ValueError):
            max_chars = settings.ai_max_input_chars

        return {
            "api_key": api_key,
            "model": model,
            "reasoning_effort": reasoning_effort,
            "max_input_chars": max_chars,
        }

    @staticmethod
    def _json_schema() -> dict[str, Any]:
        """Structured output schema for OpenAI Responses."""
        return {
            "name": "DocumentMetadata",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "object",
                        "properties": {
                            "value": {"type": ["string", "null"], "maxLength": 500},
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": ["confidence"],
                    },
                    "correspondent": {
                        "type": "object",
                        "properties": {
                            "value": {"type": ["string", "null"], "maxLength": 200},
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": ["confidence"],
                    },
                    "document_type": {
                        "type": "object",
                        "properties": {
                            "value": {"type": ["string", "null"], "maxLength": 200},
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": ["confidence"],
                    },
                    "tags": {
                        "type": "object",
                        "properties": {
                            "values": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "value": {
                                            "type": "string",
                                            "maxLength": 100,
                                        },
                                        "confidence": {
                                            "type": "number",
                                            "minimum": 0,
                                            "maximum": 1,
                                        },
                                    },
                                    "required": ["value", "confidence"],
                                },
                                "maxItems": 5,
                            },
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": ["values"],
                    },
                    "date": {
                        "type": "object",
                        "properties": {
                            "value": {
                                "type": ["string", "null"],
                                "format": "date",
                            },
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
                        },
                        "required": ["confidence"],
                    },
                },
                "required": ["title", "correspondent", "document_type", "tags", "date"],
                "additionalProperties": False,
            },
        }

    @staticmethod
    def _build_system_prompt() -> str:
        """System prompt with extraction guidance."""
        return (
            "You are an expert assistant that files scanned documents into paperless-ngx. "
            "Infer concise English metadata from OCR text and existing metadata. "
            "Respond ONLY with JSON matching the provided schema; do not add fields or prose. "
            "If evidence is missing, set the value to null and use confidence <= 0.25. "
            "Dates must be ISO YYYY-MM-DD or null; never invent dates. "
            "For correspondents, prefer the shortest, colloquial company or person name "
            "(e.g., 'Amazon' instead of 'Amazon EU SARL'). "
            "Return at most five short, English tags that are actionable labels, not sentences. "
            "Prefer OCR evidence over conflicting existing metadata."
        )

    @staticmethod
    def _build_user_prompt(document: Document, content_excerpt: str) -> str:
        """User message containing document context."""
        tags_value = ", ".join(document.tags or []) if document.tags else "none"
        created = (
            document.created_date.isoformat()
            if isinstance(document.created_date, datetime)
            else str(document.created_date)
            if document.created_date
            else "unknown"
        )

        return (
            "Extract metadata for this document. Use OCR text as primary evidence and "
            "existing metadata only as hints if it matches the text. "
            "If existing metadata conflicts with OCR evidence, trust the OCR.\n\n"
            f"Existing metadata:\n"
            f"- Title: {document.title or 'n/a'}\n"
            f"- Correspondent: {document.correspondent or 'n/a'}\n"
            f"- Document type: {document.document_type or 'n/a'}\n"
            f"- Tags: {tags_value}\n"
            f"- Current created date: {created}\n\n"
            "OCR text (truncated to fit token budget; use only text between <ocr>...</ocr>):\n"
            f"<ocr>{content_excerpt}</ocr>"
        )

    def _parse_date(self, value: str | None):
        if not value:
            return None
        try:
            parsed = date_parser.parse(value)
            if parsed and parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed
        except Exception:
            return None

    @staticmethod
    def _extract_output_text(response: Any) -> str | None:
        """Handle OpenAI Responses output changes where output can be string or array."""

        def _flatten_text(item: Any) -> str:
            if item is None:
                return ""
            if isinstance(item, str):
                return item
            # Handle SDK objects with .text
            if hasattr(item, "text"):
                text_val = getattr(item, "text")
                if isinstance(text_val, list):
                    return "".join(_flatten_text(sub) for sub in text_val)
                return str(text_val)
            if isinstance(item, dict) and "text" in item:
                text_val = item.get("text")
                if isinstance(text_val, list):
                    return "".join(_flatten_text(sub) for sub in text_val)
                return str(text_val)
            return str(item)

        try:
            # Prefer the structured output content
            output = getattr(response, "output", None)
            if output:
                content = output[0].content if output else None
                if content:
                    first = content[0]
                    if isinstance(first, list):
                        return "".join(_flatten_text(part) for part in first)
                    return _flatten_text(first)

            # Fallback to output_text helper if present
            output_text = getattr(response, "output_text", None)
            if output_text is None:
                return None
            if isinstance(output_text, list):
                return "".join(_flatten_text(part) for part in output_text)
            return str(output_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to extract output text: %s", exc)
            return None

    def process_document(
        self,
        job: AIExtractionJob,
        document: Document,
        requested_fields: list[str],
    ) -> AIExtractionResult:
        """Run OpenAI inference for a single document and persist the result."""
        ai_config = self._load_ai_settings()
        if job.model and job.model in ALLOWED_MODELS:
            ai_config["model"] = job.model
        if job.reasoning_level:
            ai_config["reasoning_effort"] = job.reasoning_level
        if job.max_input_chars:
            ai_config["max_input_chars"] = job.max_input_chars

        content_text = ""
        if document.content and isinstance(document.content, DocumentContent):
            content_text = document.content.full_text or ""
        content_excerpt = content_text[: ai_config["max_input_chars"]]

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(document, content_excerpt)

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
        ]

        # Deterministic prompt cache key per prompt version, fields, and model
        prompt_cache_key = (
            f"paperless-dedupe:v1:model:{ai_config['model']}:fields:"
            f"{','.join(sorted(requested_fields))}"
        )

        client = OpenAI(api_key=ai_config["api_key"])
        try:
            response = client.responses.create(
                model=ai_config["model"],
                input=messages,
                max_output_tokens=500,
                response_format={
                    "type": "json_schema",
                    "json_schema": self._json_schema(),
                },
                prompt_cache_key=prompt_cache_key,
                reasoning={"effort": ai_config["reasoning_effort"]},
                metadata={
                    "job_id": job.id,
                    "document_id": document.paperless_id,
                    "source": "paperless-dedupe",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("OpenAI call failed for document %s: %s", document.id, exc)
            return AIExtractionResult(
                job_id=job.id,
                document_id=document.id,
                status="failed",
                error=str(exc),
                requested_fields=requested_fields,
            )

        raw_payload: dict[str, Any] | None = None
        parsed_json: dict[str, Any] | None = None
        try:
            raw_payload = (
                response.model_dump()
                if hasattr(response, "model_dump")
                else json.loads(response.json())
            )

            output_text = self._extract_output_text(response)

            if output_text:
                parsed_json = json.loads(output_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not parse OpenAI response for document %s: %s", document.id, exc)

        if not parsed_json:
            return AIExtractionResult(
                job_id=job.id,
                document_id=document.id,
                status="failed",
                error="Empty or unparseable response from OpenAI",
                raw_response=raw_payload,
                requested_fields=requested_fields,
            )

        title_data = parsed_json.get("title") or {}
        correspondent_data = parsed_json.get("correspondent") or {}
        doc_type_data = parsed_json.get("document_type") or {}
        tags_data = parsed_json.get("tags") or {}
        date_data = parsed_json.get("date") or {}

        tag_values = tags_data.get("values") or []
        if isinstance(tag_values, list):
            tag_values = tag_values[:5]

        suggested_date = None
        if date_data.get("value"):
            suggested_date = self._parse_date(date_data["value"])

        return AIExtractionResult(
            job_id=job.id,
            document_id=document.id,
            status="pending_review",
            suggested_title=title_data.get("value"),
            title_confidence=title_data.get("confidence"),
            suggested_correspondent=correspondent_data.get("value"),
            correspondent_confidence=correspondent_data.get("confidence"),
            suggested_document_type=doc_type_data.get("value"),
            document_type_confidence=doc_type_data.get("confidence"),
            suggested_tags=tag_values,
            tags_confidence=tags_data.get("confidence"),
            suggested_date=suggested_date,
            date_confidence=date_data.get("confidence"),
            raw_response=raw_payload,
            requested_fields=requested_fields,
        )

    def health_check(self, ai_config: dict[str, Any]) -> tuple[bool, str]:
        """Free health check using model retrieval (no tokens billed)."""
        client = OpenAI(api_key=ai_config["api_key"])
        try:
            client.models.retrieve(ai_config["model"])
            return True, "OpenAI reachable and model available"
        except Exception as exc:  # noqa: BLE001
            logger.error("OpenAI health check failed: %s", exc)
            return False, str(exc)

    async def process_document_async(
        self,
        job: AIExtractionJob,
        document: Document,
        requested_fields: list[str],
    ) -> AIExtractionResult:
        """Async version to allow limited concurrency for OpenAI calls."""
        ai_config = self._load_ai_settings()
        if job.model and job.model in ALLOWED_MODELS:
            ai_config["model"] = job.model
        if job.reasoning_level:
            ai_config["reasoning_effort"] = job.reasoning_level
        if job.max_input_chars:
            ai_config["max_input_chars"] = job.max_input_chars

        content_text = ""
        if document.content and isinstance(document.content, DocumentContent):
            content_text = document.content.full_text or ""
        content_excerpt = content_text[: ai_config["max_input_chars"]]

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(document, content_excerpt)

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
        ]

        prompt_cache_key = (
            f"paperless-dedupe:v1:model:{ai_config['model']}:fields:"
            f"{','.join(sorted(requested_fields))}"
        )

        client = AsyncOpenAI(api_key=ai_config["api_key"])
        try:
            response = await client.responses.create(
                model=ai_config["model"],
                input=messages,
                max_output_tokens=500,
                response_format={
                    "type": "json_schema",
                    "json_schema": self._json_schema(),
                },
                prompt_cache_key=prompt_cache_key,
                reasoning={"effort": ai_config["reasoning_effort"]},
                metadata={
                    "job_id": job.id,
                    "document_id": document.paperless_id,
                    "source": "paperless-dedupe",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("OpenAI async call failed for document %s: %s", document.id, exc)
            return AIExtractionResult(
                job_id=job.id,
                document_id=document.id,
                status="failed",
                error=str(exc),
                requested_fields=requested_fields,
            )

        raw_payload: dict[str, Any] | None = None
        parsed_json: dict[str, Any] | None = None
        try:
            raw_payload = (
                response.model_dump()
                if hasattr(response, "model_dump")
                else json.loads(response.json())
            )

            output_text = self._extract_output_text(response)

            if output_text:
                parsed_json = json.loads(output_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not parse async OpenAI response for document %s: %s",
                document.id,
                exc,
            )

        if not parsed_json:
            return AIExtractionResult(
                job_id=job.id,
                document_id=document.id,
                status="failed",
                error="Empty or unparseable response from OpenAI",
                raw_response=raw_payload,
                requested_fields=requested_fields,
            )

        title_data = parsed_json.get("title") or {}
        correspondent_data = parsed_json.get("correspondent") or {}
        doc_type_data = parsed_json.get("document_type") or {}
        tags_data = parsed_json.get("tags") or {}
        date_data = parsed_json.get("date") or {}

        tag_values = tags_data.get("values") or []
        if isinstance(tag_values, list):
            tag_values = tag_values[:5]

        suggested_date = None
        if date_data.get("value"):
            suggested_date = self._parse_date(date_data["value"])

        return AIExtractionResult(
            job_id=job.id,
            document_id=document.id,
            status="pending_review",
            suggested_title=title_data.get("value"),
            title_confidence=title_data.get("confidence"),
            suggested_correspondent=correspondent_data.get("value"),
            correspondent_confidence=correspondent_data.get("confidence"),
            suggested_document_type=doc_type_data.get("value"),
            document_type_confidence=doc_type_data.get("confidence"),
            suggested_tags=tag_values,
            tags_confidence=tags_data.get("confidence"),
            suggested_date=suggested_date,
            date_confidence=date_data.get("confidence"),
            raw_response=raw_payload,
            requested_fields=requested_fields,
        )
