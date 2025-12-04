"""Observability helpers (tracing, metrics, logging)."""

from paperless_dedupe.observability.tracing import (
    instrument_fastapi_app,
    setup_tracing,
)

__all__ = ["setup_tracing", "instrument_fastapi_app"]
