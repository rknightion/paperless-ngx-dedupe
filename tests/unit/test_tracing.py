from fastapi import FastAPI
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from paperless_dedupe.observability.tracing import (
    instrument_fastapi_app,
    setup_tracing,
)


def test_setup_tracing_uses_expected_resource_attributes():
    exporter = InMemorySpanExporter()

    tracer_provider = setup_tracing(
        component="api", span_exporter=exporter, force=True
    )
    assert tracer_provider is not None

    attrs = tracer_provider.resource.attributes
    assert attrs["service.name"] == "paperless-dedupe-api"
    assert attrs["service.namespace"] == "paperless-ngx"
    assert attrs["paperless_dedupe.component"] == "api"
    assert "service.instance.id" in attrs


def test_instrument_fastapi_app_adds_otlp_middleware():
    exporter = InMemorySpanExporter()
    tracer_provider = setup_tracing(
        component="api", span_exporter=exporter, force=True
    )
    app = FastAPI()

    instrument_fastapi_app(app, tracer_provider=tracer_provider)

    assert getattr(app, "_is_instrumented_by_opentelemetry", False) is True
