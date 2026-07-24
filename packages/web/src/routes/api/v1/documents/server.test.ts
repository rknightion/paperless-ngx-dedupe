import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@paperless-dedupe/core';
import { encodeDocumentLibraryCursor } from '@paperless-dedupe/core/queries/types';

const mocks = vi.hoisted(() => ({
  getDocuments: vi.fn(),
  listDocumentLibrary: vi.fn(),
}));

vi.mock('@paperless-dedupe/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, getDocuments: mocks.getDocuments };
});

vi.mock('@paperless-dedupe/core/queries/documents', () => ({
  listDocumentLibrary: mocks.listDocumentLibrary,
}));

import { GET } from './+server';

describe('documents API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocuments.mockReturnValue({
      items: [{ id: 'legacy-document' }],
      total: 1,
      limit: 10,
      offset: 20,
    });
    mocks.listDocumentLibrary.mockReturnValue({
      items: [{ id: 'library-document' }],
      nextCursor: 'next-page',
      counts: {
        total: 4,
        missingOcr: 1,
        duplicateInvolved: 2,
        aiUnprocessed: 3,
        aiStale: 1,
      },
      query: { duplicate: 'involved', limit: 25 },
    });
  });

  it('preserves the legacy offset response unless library mode is explicit', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/v1/documents?correspondent=Alice&limit=10&offset=20'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.getDocuments).toHaveBeenCalledWith(
      {},
      { correspondent: 'Alice' },
      { limit: 10, offset: 20 },
    );
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'legacy-document' }],
      meta: { total: 1, limit: 10, offset: 20 },
    });
  });

  it('returns validated cursor library state and cursor-independent counts', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/documents?library=true&duplicate=involved&missingOcr=false&limit=25',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.getDocuments).not.toHaveBeenCalled();
    expect(mocks.listDocumentLibrary).toHaveBeenCalledWith(
      {},
      { duplicate: 'involved', missingOcr: false, limit: 25 },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'library-document' }],
      meta: {
        nextCursor: 'next-page',
        counts: {
          total: 4,
          missingOcr: 1,
          duplicateInvolved: 2,
          aiUnprocessed: 3,
          aiStale: 1,
        },
        query: { duplicate: 'involved', limit: 25 },
      },
    });
  });

  it('rejects offset and unknown state in cursor library mode with a safe error', async () => {
    for (const suffix of ['offset=25', 'unexpected=private-search-value']) {
      const response = await GET({
        url: new URL(`http://localhost/api/v1/documents?library=true&${suffix}`),
        locals: { db: {} },
      } as never);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          operation: 'list_document_library',
          retryable: false,
          validationIssues: expect.any(Array),
        },
      });
      expect(JSON.stringify(body)).not.toContain('private-search-value');
    }
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
  });

  it('rejects non-canonical cursors and unsupported page sizes', async () => {
    for (const suffix of ['cursor=not-a-cursor', 'limit=26']) {
      const response = await GET({
        url: new URL(`http://localhost/api/v1/documents?library=true&${suffix}`),
        locals: { db: {} },
      } as never);
      expect(response.status).toBe(400);
    }
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
  });

  it.each([
    ['library', 'true', ''],
    ['text', 'invoice', 'library=true&'],
    ['missingOcr', 'true', 'library=true&'],
    ['missingCorrespondent', 'true', 'library=true&'],
    ['missingDocumentType', 'true', 'library=true&'],
    ['missingTags', 'true', 'library=true&'],
    ['correspondent', 'Alice', 'library=true&'],
    ['correspondentSet', '["Alice","Bob"]', 'library=true&'],
    ['documentType', 'Invoice', 'library=true&'],
    ['documentTypeSet', '["Contract","Invoice"]', 'library=true&'],
    ['tag', 'finance', 'library=true&'],
    ['tagSet', '["Finance","finance"]', 'library=true&'],
    ['customFieldId', '7', 'library=true&'],
    ['customFieldValue', '"value"', 'library=true&customFieldId=7&'],
    ['duplicate', 'any', 'library=true&'],
    ['aiStatus', 'failed', 'library=true&'],
    ['freshness', 'fresh', 'library=true&'],
    [
      'cursor',
      encodeDocumentLibraryCursor({
        addedDate: '2024-01-01T00:00:00.000Z',
        paperlessId: 7,
      }),
      'library=true&',
    ],
    ['limit', '25', 'library=true&'],
  ])('rejects repeated scalar %s values in library mode', async (key, value, base) => {
    const response = await GET({
      url: new URL(`http://localhost/api/v1/documents?${base}${key}=${value}&${key}=${value}`),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(400);
    expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
  });

  it('accepts canonical data-quality filters and rejects unsafe set members', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/documents?library=true&missingOcr=true&correspondentSet=%5B%22Alice%22%2C%22Bob%22%5D&tagSet=%5B%22Finance%22%2C%22finance%22%5D',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDocumentLibrary).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        missingOcr: true,
        correspondentSet: ['Alice', 'Bob'],
        tagSet: ['Finance', 'finance'],
      }),
    );

    for (const value of ['%5B1%5D', '%5B%22Bob%22%2C%22Alice%22%5D']) {
      const invalid = await GET({
        url: new URL(`http://localhost/api/v1/documents?library=true&correspondentSet=${value}`),
        locals: { db: {} },
      } as never);
      expect(invalid.status).toBe(400);
    }
  });

  it.each([
    ['%22ACC-123%22', 'ACC-123'],
    ['42', 42],
    ['false', false],
    ['%5B1%2C2.5%5D', [1, 2.5]],
    ['null', null],
  ])('parses canonical typed custom-field URL JSON %s', async (encoded, expected) => {
    const response = await GET({
      url: new URL(
        `http://localhost/api/v1/documents?library=true&customFieldId=7&customFieldValue=${encoded}`,
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.listDocumentLibrary).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ customFieldId: 7, customFieldValue: expected }),
    );
  });

  it.each(['plain', '%2042', '1e2', '%5B1%2C%202%5D', '%5B%221%22%5D'])(
    'rejects malformed or non-canonical custom-field URL JSON %s',
    async (encoded) => {
      const response = await GET({
        url: new URL(
          `http://localhost/api/v1/documents?library=true&customFieldId=7&customFieldValue=${encoded}`,
        ),
        locals: { db: {} },
      } as never);

      expect(response.status).toBe(400);
      expect(mocks.listDocumentLibrary).not.toHaveBeenCalled();
    },
  );
});
