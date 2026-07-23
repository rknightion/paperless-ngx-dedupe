import {
  isSafeErrorCode,
  safeMessageForCode,
  sanitizeValidationIssues,
  toSafeError,
} from '@paperless-dedupe/core/contracts/api';
import type { SafeError, SafeErrorCode } from '@paperless-dedupe/core/contracts/api';

export class ApiRequestError extends Error {
  constructor(public readonly safeError: SafeError) {
    super(safeError.message);
    this.name = 'ApiRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorPayload(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.error)) {
    return undefined;
  }

  return value.error;
}

function isValidationFailure(value: Record<string, unknown> | undefined, status: number): boolean {
  return status === 400 && value?.code === 'VALIDATION_FAILED';
}

function remoteValidationIssues(value: unknown) {
  const issues = sanitizeValidationIssues(value);

  return issues?.map((issue) => ({ path: issue.path, message: 'Invalid value' }));
}

function safeErrorFromPayload(
  payload: unknown,
  operation: string,
  status: number,
  correlationId: string | undefined,
): SafeError {
  const fallback = toSafeError(undefined, { operation, status, correlationId });
  const payloadError = errorPayload(payload);
  const validationIssues =
    payloadError && isValidationFailure(payloadError, status)
      ? remoteValidationIssues(payloadError.validationIssues)
      : undefined;
  const code: SafeErrorCode = validationIssues
    ? 'VALIDATION_FAILED'
    : isSafeErrorCode(fallback.code)
      ? fallback.code
      : 'INTERNAL_ERROR';

  return {
    code,
    operation,
    message: safeMessageForCode(code),
    retryable: validationIssues ? false : fallback.retryable,
    occurredAt: fallback.occurredAt,
    ...(fallback.correlationId ? { correlationId: fallback.correlationId } : {}),
    ...(validationIssues ? { validationIssues } : {}),
  };
}

function hasData(value: unknown): value is { data: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'data' in value;
}

function correlationId(response: Response): string | undefined {
  return (
    response.headers.get('x-correlation-id') ?? response.headers.get('x-request-id') ?? undefined
  );
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  operation: string,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ApiRequestError(toSafeError(error, { operation }));
  }

  const requestCorrelationId = correlationId(response);
  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiRequestError(
      toSafeError(error, {
        operation,
        status: response.status,
        correlationId: requestCorrelationId,
      }),
    );
  }

  if (!response.ok) {
    throw new ApiRequestError(
      safeErrorFromPayload(payload, operation, response.status, requestCorrelationId),
    );
  }

  if (hasData(payload)) {
    return payload.data as T;
  }

  throw new ApiRequestError(
    toSafeError(undefined, {
      operation,
      status: response.status,
      correlationId: requestCorrelationId,
    }),
  );
}
