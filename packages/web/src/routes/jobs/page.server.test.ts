import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  listJobHistory: vi.fn(),
  getJobHistoryCounts: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    listJobHistory: mocks.listJobHistory,
    getJobHistoryCounts: mocks.getJobHistoryCounts,
  };
});

import { load } from './+page.server';

describe('jobs page server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listJobHistory.mockReturnValue({
      items: [{ key: 'safe-job-key', createdAt: '2026-07-23T12:00:00.000Z' }],
      nextCursor: 'next-cursor',
    });
    mocks.getJobHistoryCounts.mockReturnValue({ clearable: 7 });
  });

  it('loads a bounded cursor page from URL-backed filters', async () => {
    const result = await load({
      url: new URL(
        'http://localhost/jobs?type=analysis&status=failed&pageSize=50&cursor=current-cursor',
      ),
      locals: { db: {} },
    } as never);

    expect(mocks.listJobHistory).toHaveBeenCalledWith(
      {},
      {
        type: 'analysis',
        status: 'failed',
        limit: 50,
        cursor: 'current-cursor',
      },
    );
    expect(result).toEqual({
      jobs: [{ key: 'safe-job-key', createdAt: '2026-07-23T12:00:00.000Z' }],
      nextCursor: 'next-cursor',
      counts: { clearable: 7 },
      filters: { type: 'analysis', status: 'failed', pageSize: 50 },
    });
  });

  it('accepts custom-field discovery as a history filter', async () => {
    const result = await load({
      url: new URL('http://localhost/jobs?type=custom_field_discovery'),
      locals: { db: {} },
    } as never);

    expect(mocks.listJobHistory).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ type: 'custom_field_discovery' }),
    );
    expect(result).toMatchObject({
      filters: { type: 'custom_field_discovery' },
    });
  });

  it.each([
    ['type=unknown', 'type'],
    ['status=unknown', 'status'],
    ['pageSize=200', 'pageSize'],
    ['pageSize=1e2', 'pageSize'],
    ['cursor=not-valid', 'cursor'],
  ])('rejects invalid URL state without querying unbounded history: %s', async (query) => {
    const { JobHistoryQueryError } = await import('@paperless-dedupe/core');
    mocks.listJobHistory.mockImplementation(() => {
      throw new JobHistoryQueryError('cursor is invalid');
    });

    await expect(
      load({
        url: new URL(`http://localhost/jobs?${query}`),
        locals: { db: {} },
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps unexpected storage failures to a safe server error', async () => {
    mocks.listJobHistory.mockImplementation(() => {
      throw new Error('SQLITE_PRIVATE_PATH /private/documents/secret.pdf');
    });

    await expect(
      load({
        url: new URL('http://localhost/jobs?pageSize=25'),
        locals: { db: {} },
      } as never),
    ).rejects.toMatchObject({
      status: 500,
      body: { message: 'Unable to load job history' },
    });
  });
});
