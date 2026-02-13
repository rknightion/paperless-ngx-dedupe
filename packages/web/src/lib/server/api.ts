import { json } from '@sveltejs/kit';

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  NOT_READY: 'NOT_READY',
} as const;

type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const ERROR_STATUS_MAP: Record<ErrorCodeType, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  JOB_ALREADY_RUNNING: 409,
  NOT_READY: 503,
};

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return json({ data, ...(meta ? { meta } : {}) }, { status });
}

export function apiError(
  code: ErrorCodeType,
  message: string,
  details?: unknown[],
  status?: number,
) {
  const httpStatus = status ?? ERROR_STATUS_MAP[code] ?? 500;
  return json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status: httpStatus },
  );
}
