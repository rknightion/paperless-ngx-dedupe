import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, requestJson } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

async function requestFailure(response: Response): Promise<ApiRequestError> {
  mockFetch(response);

  try {
    await requestJson('/api/test', undefined, 'sync_documents');
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return error;
    }
  }

  throw new Error('Expected requestJson to throw ApiRequestError');
}

describe('requestJson', () => {
  it('reconstructs a safe local error from an unsafe response payload', async () => {
    const error = await requestFailure(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_FAILED',
            operation: 'forged_remote_operation',
            message: 'databasePassword=super-secret',
            retryable: false,
            occurredAt: 'forged-time',
            correlationId: 'forged-correlation',
            safeDetails: 'accessToken=also-secret',
            validationIssues: [
              {
                path: ['clientSecret'],
                message: 'clientSecret must not be x7Qp4M2z',
                arbitrary: { databasePassword: 'x7Qp4M2z' },
              },
            ],
          },
        }),
        {
          status: 400,
          headers: { 'x-correlation-id': 'local-correlation' },
        },
      ),
    );

    expect(error.safeError).toEqual({
      code: 'VALIDATION_FAILED',
      operation: 'sync_documents',
      message: 'Validation failed',
      retryable: false,
      occurredAt: expect.any(String),
      correlationId: 'local-correlation',
      validationIssues: [
        {
          path: ['[redacted]'],
          message: 'Invalid value',
        },
      ],
    });
    expect(JSON.stringify(error.safeError)).not.toContain('x7Qp4M2z');
  });

  it('returns safe malformed-response errors with the response correlation ID', async () => {
    const error = await requestFailure(
      new Response('<html>upstream failure</html>', {
        status: 502,
        headers: { 'x-correlation-id': 'request-123' },
      }),
    );

    expect(error.safeError).toMatchObject({
      code: 'BAD_GATEWAY',
      operation: 'sync_documents',
      message: 'The upstream service is unavailable',
      retryable: true,
      correlationId: 'request-123',
    });
  });

  it('returns only the data member from successful envelopes', async () => {
    mockFetch(new Response(JSON.stringify({ data: { id: 'safe' }, unexpected: 'discarded' })));

    await expect(
      requestJson<{ id: string }>('/api/test', undefined, 'sync_documents'),
    ).resolves.toEqual({
      id: 'safe',
    });
  });
});
