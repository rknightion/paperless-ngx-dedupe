import { json } from '@sveltejs/kit';
import {
  safeMessageForCode,
  sanitizeCorrelationId,
  sanitizeValidationIssues,
} from '@paperless-dedupe/core';

export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  NOT_READY: 'NOT_READY',
  BAD_GATEWAY: 'BAD_GATEWAY',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

type ApiErrorContext = {
  operation?: string;
  retryable?: boolean;
  correlationId?: string;
  validationIssues?: unknown;
  secrets?: readonly string[];
};

const ERROR_STATUS_MAP: Record<ErrorCodeType, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  JOB_ALREADY_RUNNING: 409,
  NOT_READY: 503,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

function isApiErrorContext(value: unknown): value is ApiErrorContext {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return json({ data, ...(meta ? { meta } : {}) }, { status });
}

export function apiError(
  code: ErrorCodeType,
  context?: ApiErrorContext,
  status?: number,
): ReturnType<typeof json>;
export function apiError(
  code: ErrorCodeType,
  legacyMessage?: string,
  legacyDetails?: readonly unknown[],
  status?: number,
): ReturnType<typeof json>;
export function apiError(
  code: ErrorCodeType,
  contextOrMessage: ApiErrorContext | string = {},
  detailsOrStatus?: readonly unknown[] | number,
  legacyStatus?: number,
) {
  const context = isApiErrorContext(contextOrMessage) ? contextOrMessage : {};
  const validationIssueInput = isApiErrorContext(contextOrMessage)
    ? context.validationIssues
    : detailsOrStatus;
  const suppliedStatus = isApiErrorContext(contextOrMessage) ? detailsOrStatus : legacyStatus;
  const httpStatus =
    (typeof suppliedStatus === 'number' ? suppliedStatus : undefined) ??
    ERROR_STATUS_MAP[code] ??
    500;
  const validationIssues = sanitizeValidationIssues(validationIssueInput, context.secrets);
  const correlationId = sanitizeCorrelationId(context.correlationId);
  return json(
    {
      error: {
        code,
        message: safeMessageForCode(code),
        operation: context.operation ?? 'api_request',
        retryable:
          context.retryable ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500),
        occurredAt: new Date().toISOString(),
        ...(correlationId ? { correlationId } : {}),
        ...(validationIssues ? { validationIssues } : {}),
      },
    },
    { status: httpStatus },
  );
}
