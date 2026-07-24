import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  listDuplicateInbox: vi.fn(),
  getDuplicateGroups: vi.fn(),
  getDuplicateStats: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    listDuplicateInbox: mocks.listDuplicateInbox,
    getDuplicateGroups: mocks.getDuplicateGroups,
    getDuplicateStats: mocks.getDuplicateStats,
  };
});

import { load } from './+page.server';

describe('duplicate inbox page load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDuplicateInbox.mockReturnValue({
      items: [{ id: 'group-1' }],
      nextCursor: 'next-page',
      counts: {
        pending: 3,
        highConfidence: 2,
        ambiguous: 1,
        ignored: 4,
        deleted: 5,
      },
      query: {
        queue: 'ambiguous',
        correspondent: 'Alice',
        limit: 25,
      },
    });
    mocks.getDuplicateGroups.mockReturnValue({
      items: [{ id: 'legacy-group', status: 'pending', confidenceScore: 0.9 }],
      total: 12,
      totalMemberCount: 24,
      limit: 2,
      offset: 2,
    });
    mocks.getDuplicateStats.mockReturnValue({ deletedGroups: 1 });
  });

  it('returns normalized URL state and cursor metadata', async () => {
    const result = await load({
      url: new URL(
        'http://localhost/duplicates?queue=ambiguous&correspondent=%20Alice%20&limit=25',
      ),
      locals: {
        db: {},
        config: { PAPERLESS_URL: 'http://paperless.internal' },
      },
    } as never);

    expect(mocks.listDuplicateInbox).toHaveBeenCalledWith(
      {},
      {
        queue: 'ambiguous',
        correspondent: 'Alice',
        limit: 25,
      },
    );
    expect(result).toMatchObject({
      groups: [{ id: 'group-1' }],
      total: 1,
      limit: 25,
      offset: 0,
      paginationMode: 'inbox',
      nextCursor: 'next-page',
      queueCounts: {
        pending: 3,
        highConfidence: 2,
        ambiguous: 1,
        ignored: 4,
        deleted: 5,
      },
      query: {
        queue: 'ambiguous',
        correspondent: 'Alice',
        limit: 25,
      },
      paperlessUrl: 'http://paperless.internal',
      deletedGroupCount: 5,
    });
  });

  it('keeps confidence, status, offset, and sort URLs on the legacy page query', async () => {
    const result = await load({
      url: new URL(
        'http://localhost/duplicates?minConfidence=0.9&status=pending&limit=2&offset=2&sortBy=created_at&sortOrder=asc',
      ),
      locals: {
        db: {},
        config: { PAPERLESS_URL: 'http://paperless.internal' },
      },
    } as never);

    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      {
        minConfidence: 0.9,
        status: ['pending'],
        sortBy: 'created_at',
        sortOrder: 'asc',
      },
      { limit: 2, offset: 2 },
    );
    expect(result).toMatchObject({
      groups: [{ id: 'legacy-group' }],
      total: 12,
      limit: 2,
      offset: 2,
      paginationMode: 'legacy',
    });
  });
});
