import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaperlessClient } from '../client.js';
import { PaperlessReadOnlyError } from '../errors.js';

const config = { url: 'https://example.test', token: 'synthetic-token', maxRetries: 0 };
afterEach(() => vi.unstubAllGlobals());

describe('Paperless recycle-bin restore', () => {
  it('sends the verified restore action with only the selected document IDs', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ result: 'OK', doc_ids: [3, 5] }));
    vi.stubGlobal('fetch', fetch);
    const client = new PaperlessClient(config);
    expect(await client.restoreFromTrash([3, 5, 3])).toEqual([3, 5]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://example.test/api/trash/');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: 'restore',
      documents: [3, 5],
    });
  });

  it('does not issue a restore for an empty selection and refuses read-only mutations', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await new PaperlessClient(config).restoreFromTrash([])).toEqual([]);
    await expect(
      new PaperlessClient({ ...config, readOnly: true }).restoreFromTrash([3]),
    ).rejects.toBeInstanceOf(PaperlessReadOnlyError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads every trash page without including unrelated document data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          count: 3,
          next: 'https://example.test/api/trash/?page=2',
          previous: null,
          results: [{ id: 3 }, { id: 5 }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          count: 3,
          next: null,
          previous: 'https://example.test/api/trash/?page=1',
          results: [{ id: 9 }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const pages: number[][] = [];
    for await (const ids of new PaperlessClient({
      ...config,
      readOnly: true,
    }).getTrashDocumentIds())
      pages.push(ids);
    expect(pages).toEqual([[3, 5], [9]]);
    expect(fetch.mock.calls.map((call) => new URL(call[0]).searchParams.get('page'))).toEqual([
      '1',
      '2',
    ]);
  });
});
