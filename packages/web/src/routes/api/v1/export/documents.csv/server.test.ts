import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamDocumentLibraryCsv: vi.fn(),
}));

vi.mock('@paperless-dedupe/core/export/documents', () => ({
  streamDocumentLibraryCsv: mocks.streamDocumentLibraryCsv,
}));

vi.mock('$lib/server/api', () => ({
  ErrorCode: { VALIDATION_FAILED: 'VALIDATION_FAILED', INTERNAL_ERROR: 'INTERNAL_ERROR' },
  apiError: (code: string, context: unknown, status?: number) =>
    Response.json(
      { error: { code, ...(context as object) } },
      { status: status ?? (code === 'INTERNAL_ERROR' ? 500 : 400) },
    ),
}));

import { GET } from './+server';

describe('document library CSV API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamDocumentLibraryCsv.mockImplementation(function* () {
      yield '\uFEFFpaperless_id,title\r\n';
      yield '2,Invoice B\r\n';
      yield '1,Invoice A\r\n';
    });
  });

  it('streams the validated active library filters as a downloadable CSV', async () => {
    const response = await GET({
      url: new URL(
        'http://localhost/api/v1/export/documents.csv?tag=finance&missingOcr=false&limit=25',
      ),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="documents-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.streamDocumentLibraryCsv).toHaveBeenCalledWith(
      {},
      { tag: 'finance', missingOcr: false, duplicate: 'any', limit: 25 },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      'paperless_id,title\r\n2,Invoice B\r\n1,Invoice A\r\n',
    );
  });

  it.each(['tag=finance&tag=legal', 'limit=25&limit=50', 'cursor=first&cursor=second'])(
    'rejects duplicate scalar parameters before opening an export stream: %s',
    async (query) => {
      const response = await GET({
        url: new URL(`http://localhost/api/v1/export/documents.csv?${query}`),
        locals: { db: {} },
      } as never);

      expect(response.status).toBe(400);
      expect(mocks.streamDocumentLibraryCsv).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toContain('finance');
    },
  );

  it.each(['unexpected=private-search-value', 'limit=26', 'missingOcr=maybe'])(
    'rejects invalid or unknown state without reflecting private values: %s',
    async (query) => {
      const response = await GET({
        url: new URL(`http://localhost/api/v1/export/documents.csv?${query}`),
        locals: { db: {} },
      } as never);

      expect(response.status).toBe(400);
      expect(mocks.streamDocumentLibraryCsv).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toContain('private-search-value');
    },
  );

  it('primes the first database page, then pulls subsequent chunks on demand and cancels', async () => {
    const iterator = {
      next: vi
        .fn()
        .mockReturnValueOnce({ done: false, value: 'header\r\n' })
        .mockReturnValue({ done: false, value: 'row\r\n' }),
      return: vi.fn().mockReturnValue({ done: true, value: undefined }),
      [Symbol.iterator]() {
        return this;
      },
    };
    mocks.streamDocumentLibraryCsv.mockReturnValue(iterator);

    const response = await GET({
      url: new URL('http://localhost/api/v1/export/documents.csv'),
      locals: { db: {} },
    } as never);

    expect(iterator.next).toHaveBeenCalledTimes(1);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('header\r\n');
    expect(iterator.next).toHaveBeenCalledTimes(1);
    await reader.cancel();
    expect(iterator.return).toHaveBeenCalledTimes(1);
  });

  it('returns a safe JSON 500 when the first database page cannot be read', async () => {
    mocks.streamDocumentLibraryCsv.mockImplementation(function* () {
      yield* [];
      throw new Error('private database path and SQL');
    });

    const response = await GET({
      url: new URL('http://localhost/api/v1/export/documents.csv?tag=finance'),
      locals: { db: {} },
    } as never);

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = JSON.stringify(await response.json());
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('private database path');
    expect(body).not.toContain('finance');
  });
});
