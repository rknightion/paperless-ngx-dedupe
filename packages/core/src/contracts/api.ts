import { z } from 'zod';

export type ValidationIssue = {
  path: readonly string[];
  message: string;
};

export type SafeError = {
  code: string;
  operation: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
  correlationId?: string;
  validationIssues?: readonly ValidationIssue[];
  safeDetails?: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  error: SafeError;
};

export type SafeErrorContext = {
  operation: string;
  status?: number;
  correlationId?: string;
  secrets?: readonly string[];
};

export const SAFE_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'CONFLICT',
  'INTERNAL_ERROR',
  'JOB_ALREADY_RUNNING',
  'NOT_READY',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
] as const;

export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];

const SAFE_ERROR_CODE_SET = new Set<string>(SAFE_ERROR_CODES);
const SAFE_ERROR_MESSAGES: Record<SafeErrorCode, string> = {
  BAD_REQUEST: 'The request is invalid',
  VALIDATION_FAILED: 'Validation failed',
  NOT_FOUND: 'The requested resource was not found',
  UNAUTHORIZED: 'Unauthorized',
  CONFLICT: 'The request conflicts with the current state',
  INTERNAL_ERROR: 'An unexpected error occurred',
  JOB_ALREADY_RUNNING: 'The operation is already running',
  NOT_READY: 'The service is not ready',
  BAD_GATEWAY: 'The upstream service is unavailable',
  SERVICE_UNAVAILABLE: 'The upstream service is unavailable',
  NETWORK_ERROR: 'Unable to reach the service',
};
const SENSITIVE_KEY_PATTERN =
  /(?:api[_-]?key|authorization|credential|passphrase|password|secret|token)/i;
const SENSITIVE_KEY_REPLACE_PATTERN =
  /(?:api[_-]?key|authorization|credential|passphrase|password|secret|token)/gi;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isSafeErrorCode(value: unknown): value is SafeErrorCode {
  return typeof value === 'string' && SAFE_ERROR_CODE_SET.has(value);
}

export function safeMessageForCode(code: SafeErrorCode): string {
  return SAFE_ERROR_MESSAGES[code];
}

function redactText(value: string, secrets: readonly string[]): string {
  let redacted = value;

  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.replaceAll(secret, '[redacted]');
    }
  }

  return redacted.replace(SENSITIVE_KEY_REPLACE_PATTERN, '[redacted]');
}

function redactPathSegment(segment: unknown, secrets: readonly string[]): string {
  const value = redactText(String(segment), secrets);

  return SENSITIVE_KEY_PATTERN.test(String(segment)) ? '[redacted]' : value;
}

function isValidationIssue(value: unknown): value is { path: unknown[]; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    Array.isArray(value.path) &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sanitizeValidationIssues(
  issues: unknown,
  secrets: readonly string[] = [],
): readonly ValidationIssue[] | undefined {
  if (!Array.isArray(issues)) {
    return undefined;
  }

  const sanitized = issues.filter(isValidationIssue).map((issue) => ({
    path: issue.path.map((segment) => redactPathSegment(segment, secrets)),
    message: redactText(issue.message, secrets),
  }));

  return sanitized.length > 0 ? sanitized : undefined;
}

function getStatus(error: unknown, context: SafeErrorContext): number | undefined {
  if (typeof context.status === 'number') {
    return context.status;
  }

  if (!isRecord(error)) {
    return undefined;
  }

  for (const key of ['status', 'statusCode'] as const) {
    const value = error[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'NetworkError' ||
    error.name === 'PaperlessConnectionError' ||
    (error instanceof TypeError && /\b(fetch|network)\b/i.test(error.message))
  );
}

function errorCodeForStatus(status: number | undefined, networkFailure: boolean): SafeErrorCode {
  if (networkFailure) {
    return 'NETWORK_ERROR';
  }

  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

export function sanitizeCorrelationId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && CORRELATION_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function toSafeError(error: unknown, context: SafeErrorContext): SafeError {
  const occurredAt = new Date().toISOString();
  const safeCorrelationId = sanitizeCorrelationId(context.correlationId);
  const validationIssues =
    error instanceof z.ZodError
      ? sanitizeValidationIssues(error.issues, context.secrets)
      : undefined;

  if (validationIssues) {
    return {
      code: 'VALIDATION_FAILED',
      operation: context.operation,
      message: 'Validation failed',
      retryable: false,
      occurredAt,
      ...(safeCorrelationId ? { correlationId: safeCorrelationId } : {}),
      validationIssues,
    };
  }

  const status = getStatus(error, context);
  const networkFailure = isNetworkFailure(error);
  const code = errorCodeForStatus(status, networkFailure);

  return {
    code,
    operation: context.operation,
    message: safeMessageForCode(code),
    retryable: networkFailure || isRetryableStatus(status),
    occurredAt,
    ...(safeCorrelationId ? { correlationId: safeCorrelationId } : {}),
  };
}
