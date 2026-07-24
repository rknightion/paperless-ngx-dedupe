import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  listDuplicateInbox: vi.fn(),
  getDuplicateGroups: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    listDuplicateInbox: mocks.listDuplicateInbox,
    getDuplicateGroups: mocks.getDuplicateGroups,
  };
});

import { GET } from './+server';

describe('duplicate inbox API', () => {
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
        queue: 'high-confidence',
        correspondent: 'Alice',
        limit: 25,
      },
    });
    mocks.getDuplicateGroups.mockReturnValue({
      items: [{ id: 'legacy-group' }],
      total: 1,
      totalMemberCount: 2,
      limit: 10,
      offset: 10,
    });
  });

  it('returns the cursor inbox in the safe data envelope with validated URL state', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/duplicates?queue=high-confidence&correspondent=%20Alice%20&limit=25',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).toHaveBeenCalledWith(
      {},
      {
        queue: 'high-confidence',
        correspondent: 'Alice',
        limit: 25,
      },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'group-1' }],
      meta: {
        nextCursor: 'next-page',
        counts: {
          pending: 3,
          highConfidence: 2,
          ambiguous: 1,
          ignored: 4,
          deleted: 5,
        },
        query: {
          queue: 'high-confidence',
          correspondent: 'Alice',
          limit: 25,
        },
      },
    });
  });

  it('preserves the legacy response for a request without query parameters', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/duplicates'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'legacy-group' }],
      meta: {
        total: 1,
        totalMemberCount: 2,
        limit: 10,
        offset: 10,
      },
    });
  });

  it('preserves the legacy response when limit is the only query parameter', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/duplicates?limit=1'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 1, offset: 0 },
    );
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        total: 1,
        totalMemberCount: 2,
        limit: 10,
        offset: 10,
      },
    });
  });

  it('preserves the legacy validation envelope for an invalid limit', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/duplicates?limit=0'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        operation: 'api_request',
        retryable: false,
        validationIssues: expect.any(Array),
      },
    });
  });

  it('preserves the legacy query when confidence is the only filter', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/duplicates?minConfidence=0.9&limit=25'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      { minConfidence: 0.9, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 25, offset: 0 },
    );
  });

  it('preserves legacy confidence, status, offset, and sort parameters together', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/duplicates?minConfidence=0.9&status=pending&limit=10&offset=10&sortBy=created_at&sortOrder=asc',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      {
        minConfidence: 0.9,
        status: ['pending'],
        sortBy: 'created_at',
        sortOrder: 'asc',
      },
      { limit: 10, offset: 10 },
    );
  });

  it('preserves legacy parsing when an unrelated query parameter is present', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/duplicates?minConfidence=0.9&limit=25&legacyClientHint=keep',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      { minConfidence: 0.9, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 25, offset: 0 },
    );
  });

  it('allows confidence filtering when a new inbox selector is explicit', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/duplicates?correspondent=Alice&minConfidence=0.9&limit=25',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.getDuplicateGroups).not.toHaveBeenCalled();
    expect(mocks.listDuplicateInbox).toHaveBeenCalledWith(
      {},
      { queue: 'pending', correspondent: 'Alice', minConfidence: 0.9, limit: 25 },
    );
  });

  it('rejects unknown inbox URL fields with a structured safe error', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/duplicates?queue=pending&unexpected=private-value'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        operation: 'list_duplicate_inbox',
        retryable: false,
        validationIssues: [{ path: [], message: expect.any(String) }],
      },
    });
  });

  it('preserves the legacy offset API contract for explicit legacy filters', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/duplicates?status=pending&sortBy=confidence&sortOrder=desc&limit=10&offset=10',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDuplicateInbox).not.toHaveBeenCalled();
    expect(mocks.getDuplicateGroups).toHaveBeenCalledWith(
      {},
      { status: ['pending'], sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 10, offset: 10 },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'legacy-group' }],
      meta: {
        total: 1,
        totalMemberCount: 2,
        limit: 10,
        offset: 10,
      },
    });
  });
});
