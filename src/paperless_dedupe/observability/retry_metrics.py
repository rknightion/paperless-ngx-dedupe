from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Any


@dataclass
class ServiceRetryMetrics:
    retries: int = 0
    rate_limit_hits: int = 0
    last_retry_at: datetime | None = None
    last_rate_limit_at: datetime | None = None
    last_error: str | None = None
    last_error_at: datetime | None = None
    last_status_code: int | None = None
    last_retry_after_s: float | None = None


_metrics: dict[str, ServiceRetryMetrics] = {
    "paperless": ServiceRetryMetrics(),
    "openai": ServiceRetryMetrics(),
}
_lock = Lock()


def _now() -> datetime:
    return datetime.now(UTC)


def _sanitize_error(exc: Exception | None) -> str | None:
    if exc is None:
        return None
    message = str(exc)
    if len(message) > 200:
        message = message[:200] + "..."
    return message


def record_retry(
    service: str,
    exc: Exception | None = None,
    status_code: int | None = None,
    retry_after: float | None = None,
) -> None:
    with _lock:
        stats = _metrics.setdefault(service, ServiceRetryMetrics())
        stats.retries += 1
        stats.last_retry_at = _now()
        if retry_after is not None:
            stats.last_retry_after_s = retry_after
        if status_code is not None:
            stats.last_status_code = status_code
        if exc is not None:
            stats.last_error = _sanitize_error(exc)
            stats.last_error_at = stats.last_retry_at


def record_rate_limit(
    service: str,
    exc: Exception | None = None,
    status_code: int | None = None,
    retry_after: float | None = None,
) -> None:
    with _lock:
        stats = _metrics.setdefault(service, ServiceRetryMetrics())
        stats.rate_limit_hits += 1
        stats.last_rate_limit_at = _now()
        if retry_after is not None:
            stats.last_retry_after_s = retry_after
        if status_code is not None:
            stats.last_status_code = status_code
        if exc is not None:
            stats.last_error = _sanitize_error(exc)
            stats.last_error_at = stats.last_rate_limit_at


def record_error(
    service: str,
    exc: Exception | None = None,
    status_code: int | None = None,
) -> None:
    with _lock:
        stats = _metrics.setdefault(service, ServiceRetryMetrics())
        if exc is not None:
            stats.last_error = _sanitize_error(exc)
        stats.last_error_at = _now()
        if status_code is not None:
            stats.last_status_code = status_code


def snapshot_retry_metrics() -> dict[str, Any]:
    with _lock:
        snapshot: dict[str, Any] = {}
        for service, stats in _metrics.items():
            snapshot[service] = {
                "retries": stats.retries,
                "rate_limit_hits": stats.rate_limit_hits,
                "last_retry_at": stats.last_retry_at.isoformat()
                if stats.last_retry_at
                else None,
                "last_rate_limit_at": stats.last_rate_limit_at.isoformat()
                if stats.last_rate_limit_at
                else None,
                "last_error": stats.last_error,
                "last_error_at": stats.last_error_at.isoformat()
                if stats.last_error_at
                else None,
                "last_status_code": stats.last_status_code,
                "last_retry_after_s": stats.last_retry_after_s,
            }
        return snapshot
