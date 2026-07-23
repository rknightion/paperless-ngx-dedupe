import { describe, expect, it } from 'vitest';
import { apiError, ErrorCode } from './api.js';

describe('apiError', () => {
  it('emits only a safe envelope and sanitized validation issues', async () => {
    const response = apiError(
      ErrorCode.VALIDATION_FAILED,
      {
        validationIssues: [
          {
            path: ['databasePassword'],
            message: 'clientSecret must not equal super-secret',
            technical: { accessToken: 'also-secret' },
          },
        ],
        secrets: ['super-secret', 'also-secret'],
        correlationId: 'unsafe correlation id',
      },
      400,
    );

    const payload = await response.json();

    expect(payload).toEqual({
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        operation: 'api_request',
        message: 'Validation failed',
        retryable: false,
        occurredAt: expect.any(String),
        validationIssues: [
          {
            path: ['[redacted]'],
            message: 'client[redacted] must not equal [redacted]',
          },
        ],
      },
    });
  });

  it('keeps legacy arguments callable but discards their raw message and details', async () => {
    const response = apiError(ErrorCode.BAD_REQUEST, 'accessToken=super-secret', [
      { arbitrary: 'super-secret' },
    ]);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: ErrorCode.BAD_REQUEST,
        operation: 'api_request',
        message: 'The request is invalid',
        retryable: false,
        occurredAt: expect.any(String),
      },
    });
  });
});
