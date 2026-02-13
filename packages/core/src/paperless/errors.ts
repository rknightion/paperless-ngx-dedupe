export class PaperlessApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'PaperlessApiError';
  }

  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

export class PaperlessAuthError extends PaperlessApiError {
  constructor(message: string, statusCode: number, responseBody?: string) {
    super(message, statusCode, responseBody);
    this.name = 'PaperlessAuthError';
  }
}

export class PaperlessConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PaperlessConnectionError';
  }
}
