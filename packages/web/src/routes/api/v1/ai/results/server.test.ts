import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getAiResults: vi.fn(),
  listAiReviewInbox: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    getAiResults: mocks.getAiResults,
    listAiReviewInbox: mocks.listAiReviewInbox,
  };
});

import { GET } from './+server';

describe('AI results inbox API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiResults.mockReturnValue({ items: [{ id: 'legacy' }], total: 1 });
    mocks.listAiReviewInbox.mockReturnValue({
      items: [{ id: 'review-1' }],
      total: 12,
      nextCursor: 'next-token',
      previousCursor: null,
      failureGroups: [],
    });
  });

  it('keeps the legacy offset contract unless inbox mode is explicit', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/ai/results?limit=10&offset=20'),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).not.toHaveBeenCalled();
    expect(mocks.getAiResults).toHaveBeenCalledWith({}, {}, 10, 20);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'legacy' }],
      meta: { total: 1, limit: 10, offset: 20 },
    });
  });

  it('returns cursor metadata only in explicit inbox mode', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/ai/results?mode=inbox&queue=failures&limit=25&cursor=opaque&search=invoice',
      ),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).toHaveBeenCalledWith(
      {},
      {
        queue: 'failures',
        limit: 25,
        cursor: 'opaque',
        search: 'invoice',
      },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'review-1' }],
      meta: {
        total: 12,
        limit: 25,
        nextCursor: 'next-token',
        previousCursor: null,
        failureGroups: [],
      },
    });
  });

  it('passes document and failure category filters only in explicit inbox mode', async () => {
    await GET({
      url: new URL(
        'http://localhost/api/v1/ai/results?mode=inbox&queue=failures&documentId=doc-1&failureCategory=temporary',
      ),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).toHaveBeenCalledWith(
      {},
      {
        queue: 'failures',
        limit: 20,
        documentId: 'doc-1',
        failureCategory: 'temporary',
      },
    );
  });
});
