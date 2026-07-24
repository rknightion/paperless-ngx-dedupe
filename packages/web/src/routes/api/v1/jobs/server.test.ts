import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(),
  listJobHistory: vi.fn(),
  getJobHistoryCounts: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    listJobs: mocks.listJobs,
    listJobHistory: mocks.listJobHistory,
    getJobHistoryCounts: mocks.getJobHistoryCounts,
  };
});

import { GET } from './+server';

describe('jobs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listJobs.mockReturnValue([{ id: 'legacy-job' }]);
    mocks.listJobHistory.mockReturnValue({
      items: [{ key: 'safe-history-key' }],
      nextCursor: 'next-page',
    });
    mocks.getJobHistoryCounts.mockReturnValue({ clearable: 7 });
  });

  it('preserves the legacy array contract when cursor pagination is not requested', async () => {
    mocks.listJobs.mockReturnValue([
      {
        id: 'legacy-job',
        type: 'sync',
        status: 'completed',
        publicHistoryKey: 'PRIVATE_INTERNAL_KEY',
      },
    ]);
    const response = await GET({
      url: new URL('http://localhost/api/v1/jobs?type=SYNC&limit=1'),
      locals: { db: {} },
    } as never);

    expect(mocks.listJobs).toHaveBeenCalledWith({}, { type: 'SYNC', status: undefined, limit: 1 });
    expect(mocks.listJobHistory).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'legacy-job', type: 'sync', status: 'completed' }],
    });
  });

  it('returns cursor metadata in explicit page mode', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/jobs?pageSize=25&type=sync&status=completed&cursor=current-page',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listJobHistory).toHaveBeenCalledWith(
      {},
      {
        type: 'sync',
        status: 'completed',
        limit: 25,
        cursor: 'current-page',
      },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ key: 'safe-history-key' }],
      meta: {
        nextCursor: 'next-page',
        pageSize: 25,
        filters: { type: 'sync', status: 'completed' },
        counts: { clearable: 7 },
      },
    });
  });

  it('accepts custom-field discovery as a cursor history filter', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/jobs?pageSize=25&type=custom_field_discovery'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listJobHistory).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ type: 'custom_field_discovery' }),
    );
  });

  it.each([
    ['pageSize=0', 'pageSize'],
    ['pageSize=1e2', 'pageSize'],
    ['pageSize=25&type=unknown', 'type'],
    ['pageSize=25&status=unknown', 'status'],
    ['pageSize=25&cursor=%25%25%25', 'cursor'],
  ])('returns a safe validation error for %s', async (query, expectedField) => {
    const { JobHistoryQueryError } = await import('@paperless-dedupe/core');
    mocks.listJobHistory.mockImplementation(() => {
      throw new JobHistoryQueryError('cursor is invalid');
    });
    const response = await GET({
      url: new URL(`http://localhost/api/v1/jobs?${query}`),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      operation: 'api_request',
      retryable: false,
    });
    expect(JSON.stringify(body.error)).toContain(expectedField);
  });

  it('returns a safe 500 without exposing unexpected database errors', async () => {
    mocks.listJobHistory.mockImplementation(() => {
      throw new Error('SQLITE_PRIVATE_PATH /private/documents/secret.pdf');
    });
    const response = await GET({
      url: new URL('http://localhost/api/v1/jobs?pageSize=25'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('SQLITE_PRIVATE_PATH');
  });
});
