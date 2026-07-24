import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  listAiReviewInbox: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return {
    ...actual,
    getAiConfig: mocks.getAiConfig,
    listAiReviewInbox: mocks.listAiReviewInbox,
  };
});

import { load } from './+page.server';

describe('AI review inbox page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiConfig.mockReturnValue({
      extractTitle: true,
      extractCorrespondent: true,
      extractDocumentType: true,
      extractTags: true,
      extractCustomFields: true,
      addProcessedTag: true,
    });
    mocks.listAiReviewInbox.mockReturnValue({
      items: [{ id: 'ai-1' }],
      total: 5,
      nextCursor: 'next',
      previousCursor: null,
      failureGroups: [{ category: 'temporary', label: 'Temporary service issue', count: 2 }],
    });
  });

  it('loads URL-backed cursor filters and extraction failure queue', async () => {
    const result = await load({
      url: new URL(
        'http://localhost/ai-processing/review?queue=failures&limit=50&cursor=cursor-1&search=%20invoice%20&changedOnly=true',
      ),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).toHaveBeenCalledWith(
      {},
      {
        queue: 'failures',
        limit: 50,
        cursor: 'cursor-1',
        search: 'invoice',
        changedOnly: true,
      },
    );
    expect(result).toMatchObject({
      results: [{ id: 'ai-1' }],
      total: 5,
      queue: 'failures',
      limit: 50,
      nextCursor: 'next',
      previousCursor: null,
      extractEnabled: { processedTag: true },
    });
  });

  it('defaults to the review inbox without using an offset', async () => {
    await load({
      url: new URL('http://localhost/ai-processing/review'),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).toHaveBeenCalledWith({}, { queue: 'review', limit: 20 });
  });

  it('targets one internal document and accepts only a same-origin documents return path', async () => {
    const result = await load({
      url: new URL(
        'http://localhost/ai-processing/review?queue=history&documentId=doc-1&returnTo=%2Fdocuments%3Fsearch%3Dinvoice',
      ),
      locals: { db: {} },
    } as never);

    expect(mocks.listAiReviewInbox).toHaveBeenCalledWith(
      {},
      { queue: 'history', limit: 20, documentId: 'doc-1' },
    );
    expect(result).toMatchObject({
      documentId: 'doc-1',
      returnTo: '/documents?search=invoice',
    });

    for (const unsafeTarget of [
      'https://evil.example',
      '//evil.example/documents',
      '/documents-elsewhere',
      '/documents/../settings',
      '/documents\\..\\settings',
      '/documents\u0000?search=invoice',
    ]) {
      const unsafe = await load({
        url: new URL(
          `http://localhost/ai-processing/review?documentId=doc-1&returnTo=${encodeURIComponent(unsafeTarget)}`,
        ),
        locals: { db: {} },
      } as never);
      expect(unsafe).toMatchObject({ returnTo: null });
    }
  });
});
