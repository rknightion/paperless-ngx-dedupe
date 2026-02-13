import type { ApiErrorBody } from './types.js';

export class PaperlessDedupeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaperlessDedupeError';
  }
}

export class PaperlessDedupeApiError extends PaperlessDedupeError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown[] | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'PaperlessDedupeApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export class PaperlessDedupeNetworkError extends PaperlessDedupeError {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PaperlessDedupeNetworkError';
    this.cause = cause;
  }
}
