import { describe, expect, it, vi } from 'vitest';
import { runCustomFieldDiscovery } from './custom-field-discovery-client.js';

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('runCustomFieldDiscovery', () => {
  it('starts, polls, and loads the durable aggregate result', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            data: {
              jobId: 'job-discovery',
              existingFieldsUnavailable: false,
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(response({ data: { status: 'running', progress: 0.4 } }))
      .mockResolvedValueOnce(response({ data: { status: 'completed', progress: 1 } }))
      .mockResolvedValueOnce(
        response({
          data: {
            run: {
              key: 'opaque-run',
              status: 'completed',
              result: { documentsScanned: 10, candidates: [] },
            },
          },
        }),
      );
    const statuses: string[] = [];

    const result = await runCustomFieldDiscovery({
      fetcher,
      wait: async () => undefined,
      onStatus: (status) => statuses.push(status),
    });

    expect(result).toMatchObject({
      key: 'opaque-run',
      result: { documentsScanned: 10, candidates: [] },
    });
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/ai/custom-fields/recommendations', 'POST'],
      ['/api/v1/jobs/job-discovery', 'GET'],
      ['/api/v1/jobs/job-discovery', 'GET'],
      ['/api/v1/ai/custom-fields/recommendations', 'GET'],
    ]);
    expect(statuses).toEqual(['queued', 'running', 'completed']);
  });

  it('surfaces a safe failure when the durable job fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ data: { jobId: 'job-discovery', existingFieldsUnavailable: true } }, 202),
      )
      .mockResolvedValueOnce(
        response({ data: { status: 'failed', errorMessage: 'private OCR contents' } }),
      );

    await expect(runCustomFieldDiscovery({ fetcher, wait: async () => undefined })).rejects.toThrow(
      'Custom-field discovery failed',
    );
  });
});
