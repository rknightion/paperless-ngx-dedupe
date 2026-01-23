from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

from paperless_dedupe.observability.retry_metrics import (
    record_error,
    record_rate_limit,
    record_retry,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass(frozen=True)
class RetryDecision:
    retryable: bool
    rate_limited: bool = False
    retry_after: float | None = None
    status_code: int | None = None


def extract_status_code(exc: Exception) -> int | None:
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status
    status = getattr(exc, "status", None)
    if isinstance(status, int):
        return status
    status = getattr(exc, "http_status", None)
    if isinstance(status, int):
        return status
    response = getattr(exc, "response", None)
    if response is not None:
        status = getattr(response, "status_code", None)
        if isinstance(status, int):
            return status
    return None


def extract_retry_after_seconds(exc: Exception) -> float | None:
    retry_after = getattr(exc, "retry_after", None)
    if retry_after is not None:
        try:
            return float(retry_after)
        except (TypeError, ValueError):
            pass

    headers = getattr(exc, "headers", None)
    if headers is None:
        headers = getattr(exc, "response_headers", None)
    response = getattr(exc, "response", None)
    if headers is None and response is not None:
        headers = getattr(response, "headers", None)

    if headers:
        value = headers.get("Retry-After") or headers.get("retry-after")
        if value:
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

    return None


def _compute_delay(base_delay: float, attempt: int, max_delay: float) -> float:
    delay = base_delay * (2 ** max(0, attempt - 1))
    delay = min(delay, max_delay)
    # Add jitter to avoid coordinated retries
    return delay * (0.5 + random.random())


def _log_retry(
    operation: str,
    decision: RetryDecision,
    exc: Exception,
    delay: float,
    attempt: int,
    max_retries: int,
) -> None:
    status = decision.status_code
    error_name = exc.__class__.__name__
    logger.warning(
        "%s failed with %s (status=%s). Retrying in %.2fs (attempt %d/%d)",
        operation,
        error_name,
        status,
        delay,
        attempt,
        max_retries,
    )


def retry_sync(
    operation: str,
    func: Callable[[], T],
    *,
    classify: Callable[[Exception], RetryDecision],
    service: str,
    max_retries: int,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
) -> T:
    attempts = 0
    while True:
        try:
            return func()
        except Exception as exc:  # noqa: BLE001
            decision = classify(exc)
            if not decision.retryable or attempts >= max_retries:
                record_error(service, exc, decision.status_code)
                raise

            attempts += 1
            if decision.rate_limited:
                record_rate_limit(
                    service, exc, decision.status_code, decision.retry_after
                )
            record_retry(service, exc, decision.status_code, decision.retry_after)

            delay = decision.retry_after
            if delay is None or delay <= 0:
                delay = _compute_delay(base_delay, attempts, max_delay)
            _log_retry(operation, decision, exc, delay, attempts, max_retries)
            time.sleep(delay)


async def retry_async(
    operation: str,
    func: Callable[[], Awaitable[T]],
    *,
    classify: Callable[[Exception], RetryDecision],
    service: str,
    max_retries: int,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
) -> T:
    attempts = 0
    while True:
        try:
            return await func()
        except Exception as exc:  # noqa: BLE001
            decision = classify(exc)
            if not decision.retryable or attempts >= max_retries:
                record_error(service, exc, decision.status_code)
                raise

            attempts += 1
            if decision.rate_limited:
                record_rate_limit(
                    service, exc, decision.status_code, decision.retry_after
                )
            record_retry(service, exc, decision.status_code, decision.retry_after)

            delay = decision.retry_after
            if delay is None or delay <= 0:
                delay = _compute_delay(base_delay, attempts, max_delay)
            _log_retry(operation, decision, exc, delay, attempts, max_retries)
            await asyncio.sleep(delay)
