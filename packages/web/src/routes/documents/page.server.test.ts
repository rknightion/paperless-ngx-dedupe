import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';

const mocks = vi.hoisted(() => ({
  getDocumentStats: vi.fn(),
  listDocumentLibrary: vi.fn(),
  getDataQualityInsights: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, getDocumentStats: mocks.getDocumentStats };
});

vi.mock('@paperless-dedupe/core/queries/documents', () => ({
  listDocumentLibrary: mocks.listDocumentLibrary,
}));

vi.mock('@paperless-dedupe/core/queries/data-quality', () => ({
  getDataQualityInsights: mocks.getDataQualityInsights,
}));

import { load } from './+page.server';

describe('documents page load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentStats.mockReturnValue({ totalDocuments: 3 });
    mocks.listDocumentLibrary.mockReturnValue({
      items: [{ id: 'doc-1' }],
      nextCursor: 'next-page',
      counts: {
        total: 3,
        missingOcr: 1,
        duplicateInvolved: 1,
        aiUnprocessed: 1,
        aiStale: 0,
      },
      query: {
        text: 'invoice',
        duplicate: 'any',
        limit: 25,
      },
    });
    mocks.getDataQualityInsights.mockReturnValue({
      totalDocuments: 3,
      insights: [
        {
          kind: 'missing-tags',
          count: 1,
          label: '1 document has no tags',
          url: '/documents?library=true&missingTags=true',
        },
      ],
    });
  });

  it('adds normalized cursor library data only when library mode is explicit', async () => {
    const result = await load({
      url: new URL('http://localhost/documents?library=true&text=%20invoice%20&limit=25'),
      locals: {
        db: {},
        config: {
          PAPERLESS_URL: 'http://paperless.internal',
          AI_ENABLED: true,
        },
      },
    } as never);

    expect(mocks.getDocumentStats).toHaveBeenCalledWith({});
    expect(mocks.listDocumentLibrary).toHaveBeenCalledWith(
      {},
      { text: 'invoice', duplicate: 'any', limit: 25 },
    );
    expect(result).toEqual({
      stats: { totalDocuments: 3 },
      paperlessUrl: 'http://paperless.internal',
      aiEnabled: true,
      library: {
        items: [{ id: 'doc-1' }],
        nextCursor: 'next-page',
        counts: {
          total: 3,
          missingOcr: 1,
          duplicateInvolved: 1,
          aiUnprocessed: 1,
          aiStale: 0,
        },
        query: {
          text: 'invoice',
          duplicate: 'any',
          limit: 25,
        },
      },
      dataQuality: {
        totalDocuments: 3,
        insights: [
          {
            kind: 'missing-tags',
            count: 1,
            label: '1 document has no tags',
            url: '/documents?library=true&missingTags=true',
          },
        ],
      },
    });
    expect(mocks.getDataQualityInsights).toHaveBeenCalledWith({});
  });

  it('preserves the exact legacy page response for no query or old arbitrary query state', async () => {
    for (const suffix of ['', '?offset=25&campaign=legacy&text=ignored']) {
      const result = await load({
        url: new URL(`http://localhost/documents${suffix}`),
        locals: {
          db: {},
          config: { PAPERLESS_URL: 'http://paperless.internal', AI_ENABLED: true },
        },
      } as never);

      expect(result).toEqual({
        stats: { totalDocuments: 3 },
        paperlessUrl: 'http://paperless.internal',
        aiEnabled: true,
      });
    }
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
    expect(mocks.getDataQualityInsights).not.toHaveBeenCalled();
  });

  it('rejects unsafe, unknown, offset, and invalid cursor URL state in explicit library mode', async () => {
    for (const suffix of ['unexpected=private-value', 'offset=25', 'cursor=not-a-cursor']) {
      await expect(
        load({
          url: new URL(`http://localhost/documents?library=true&${suffix}`),
          locals: {
            db: {},
            config: { PAPERLESS_URL: 'http://paperless.internal', AI_ENABLED: true },
          },
        } as never),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
  });

  it('rejects repeated library discriminators and filter values', async () => {
    for (const suffix of [
      'library=true&library=true',
      'library=true&text=first&text=second',
      'library=true&limit=25&limit=50',
    ]) {
      await expect(
        load({
          url: new URL(`http://localhost/documents?${suffix}`),
          locals: {
            db: {},
            config: { PAPERLESS_URL: 'http://paperless.internal', AI_ENABLED: true },
          },
        } as never),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
  });
});
