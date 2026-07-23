import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sanitizeValidationIssues, toSafeError } from '../api.js';

describe('toSafeError', () => {
  it('redacts unknown thrown values without making them retryable', () => {
    const error = toSafeError(
      {
        message: 'database password=super-secret failed',
        password: 'super-secret',
      },
      { operation: 'sync_documents', secrets: ['super-secret'] },
    );

    expect(error).toMatchObject({
      code: 'INTERNAL_ERROR',
      operation: 'sync_documents',
      message: 'An unexpected error occurred',
      retryable: false,
    });
    expect(error.occurredAt).toEqual(expect.any(String));
    expect(JSON.stringify(error)).not.toContain('super-secret');
    expect(JSON.stringify(error)).not.toContain('password');
  });

  it.each([
    [new TypeError('fetch failed'), undefined],
    [new Error('upstream failed'), 502],
    [new Error('upstream failed'), 503],
  ])('marks network and transient HTTP failures as retryable', (thrown, status) => {
    const error = toSafeError(thrown, { operation: 'sync_documents', status });

    expect(error.retryable).toBe(true);
  });

  it('keeps Zod validation issues as redacted path and message pairs', () => {
    const result = z.object({ password: z.string() }).safeParse({ password: 1 });

    if (result.success) {
      throw new Error('Expected validation to fail');
    }

    const error = toSafeError(result.error, {
      operation: 'save_settings',
      secrets: ['1'],
    });

    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      operation: 'save_settings',
      message: 'Validation failed',
      retryable: false,
      validationIssues: [{ path: ['[redacted]'], message: expect.any(String) }],
    });
    expect(JSON.stringify(error)).not.toContain('password');
  });

  it('redacts camelCase sensitive names in validation paths and messages', () => {
    expect(
      sanitizeValidationIssues([
        {
          path: ['databasePassword'],
          message: 'accessToken and clientSecret are invalid',
        },
      ]),
    ).toEqual([
      {
        path: ['[redacted]'],
        message: 'access[redacted] and client[redacted] are invalid',
      },
    ]);
  });
});
