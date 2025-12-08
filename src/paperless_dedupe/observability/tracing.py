"""Centralized OpenTelemetry tracing configuration."""

from __future__ import annotations

import logging
import os
import socket
from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import (
    SERVICE_INSTANCE_ID,
    SERVICE_NAME,
    SERVICE_NAMESPACE,
    SERVICE_VERSION,
    OTELResourceDetector,
    Resource,
)
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

try:  # Optional instrumentation
    from opentelemetry.instrumentation.asyncio import AsyncioInstrumentor
except Exception:  # pragma: no cover - optional dependency
    AsyncioInstrumentor = None  # type: ignore

from paperless_dedupe.core.config import settings

logger = logging.getLogger(__name__)

_tracer_provider: TracerProvider | None = None
_tracing_initialized = False


def _build_resource(component: str, extra: dict[str, Any] | None = None) -> Resource:
    """Create an OTEL resource with sane defaults plus env overrides."""
    environment = (
        os.getenv("PAPERLESS_DEDUPE_ENV")
        or os.getenv("DEPLOYMENT_ENVIRONMENT")
        or "development"
    )
    instance_id = os.getenv("OTEL_SERVICE_INSTANCE_ID") or socket.gethostname()
    service_name = os.getenv("OTEL_SERVICE_NAME") or f"paperless-dedupe-{component}"

    base_attributes: dict[str, Any] = {
        SERVICE_NAME: service_name,
        SERVICE_NAMESPACE: "paperless-ngx",
        SERVICE_VERSION: settings.version,
        "deployment.environment": environment,
        SERVICE_INSTANCE_ID: instance_id,
        "paperless_dedupe.component": component,
    }
    if extra:
        base_attributes.update(extra)

    # Merge env-provided resource attributes so operators can override defaults
    env_resource = OTELResourceDetector().detect()
    return Resource.create(base_attributes).merge(env_resource)


def _otlp_configured() -> bool:
    """Only enable OTLP exporter if an endpoint/exporter is configured."""
    traces_exporter = os.getenv("OTEL_TRACES_EXPORTER")
    if traces_exporter and traces_exporter.lower() not in {
        "otlp",
        "otlp_proto_http",
        "otlp_proto_grpc",
        "otlp_proto",
    }:
        return False

    otlp_env = any(key.startswith("OTEL_EXPORTER_OTLP_") for key in os.environ.keys())
    return otlp_env or bool(traces_exporter)


def setup_tracing(
    component: str = "api",
    span_exporter: SpanExporter | None = None,
    force: bool = False,
) -> TracerProvider | None:
    """Initialise the tracer provider and common instrumentation.

    Args:
        component: Logical component name (api | worker | cli)
        span_exporter: Optional exporter override (useful for tests)
        force: Re-initialise even if tracing was already configured
    """
    global _tracer_provider, _tracing_initialized

    if os.getenv("OTEL_SDK_DISABLED", "false").lower() == "true":
        logger.info("OTEL_SDK_DISABLED=true - skipping tracing setup")
        return None

    tracer_provider: TracerProvider | None = None
    if _tracing_initialized and _tracer_provider and not force:
        tracer_provider = _tracer_provider
    else:
        resource = _build_resource(component)
        existing_provider = trace.get_tracer_provider()
        if isinstance(existing_provider, TracerProvider) and not force:
            tracer_provider = existing_provider
        else:
            tracer_provider = TracerProvider(resource=resource)
            try:
                trace.set_tracer_provider(tracer_provider)
            except Exception as exc:  # pragma: no cover - defensive fallback
                logger.debug(
                    "Tracer provider already set, reusing existing provider: %s", exc
                )
                tracer_provider = (
                    existing_provider
                    if isinstance(existing_provider, TracerProvider)
                    else tracer_provider
                )

    if tracer_provider:
        exporter = span_exporter
        if exporter is None and _otlp_configured():
            try:
                exporter = OTLPSpanExporter()
            except Exception as exc:  # pragma: no cover - depends on env config
                logger.warning(
                    "OTLP exporter unavailable, traces will stay local: %s", exc
                )
                exporter = None

        if exporter:
            tracer_provider.add_span_processor(BatchSpanProcessor(exporter))

    _tracer_provider = tracer_provider

    # Core instrumentation
    LoggingInstrumentor().instrument(set_logging_format=True)
    if AsyncioInstrumentor:
        try:
            AsyncioInstrumentor().instrument()
        except Exception as exc:  # pragma: no cover - optional
            logger.debug("Asyncio instrumentation failed: %s", exc)

    RequestsInstrumentor().instrument(tracer_provider=tracer_provider)
    HTTPXClientInstrumentor().instrument(tracer_provider=tracer_provider)

    try:
        RedisInstrumentor().instrument(tracer_provider=tracer_provider)
    except Exception as exc:  # pragma: no cover - optional
        logger.debug("Redis instrumentation failed: %s", exc)

    try:
        from paperless_dedupe.models.database import engine

        SQLAlchemyInstrumentor().instrument(
            engine=engine,
            tracer_provider=tracer_provider,
            enable_commenter=True,
            commenter_options={"dbms": "postgresql"},
        )
    except Exception as exc:  # pragma: no cover - instrumentation best-effort
        logger.debug("SQLAlchemy instrumentation failed: %s", exc)

    try:
        CeleryInstrumentor().instrument(tracer_provider=tracer_provider)
    except Exception as exc:  # pragma: no cover - optional
        logger.debug("Celery instrumentation failed: %s", exc)

    _tracing_initialized = True
    return tracer_provider


def instrument_fastapi_app(app, tracer_provider: TracerProvider | None = None) -> None:
    """Instrument a FastAPI app with OTEL middleware."""
    provider = tracer_provider or _tracer_provider or setup_tracing("api")
    if provider is None:
        return

    FastAPIInstrumentor.instrument_app(
        app,
        tracer_provider=provider,
        excluded_urls="(/api/v1/health.*|/health.*|/metrics)",
    )
