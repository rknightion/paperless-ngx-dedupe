/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaperlessClient } from '../client.js';
import { PaperlessApiError, PaperlessAuthError, PaperlessConnectionError } from '../errors.js';

vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

let mockFetch: ReturnType<typeof vi.fn>;

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: statusTextFor(status),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function statusTextFor(status: number): string {
  const texts: Record<number, string> = {
    200: 'OK',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return texts[status] ?? '';
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    statusText: statusTextFor(status),
  });
}

function makeSnakeCaseDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Doc 1',
    content: 'content text',
    tags: [1, 2],
    correspondent: null,
    document_type: null,
    created: '2024-01-01',
    modified: '2024-01-01',
    added: '2024-01-01',
    original_file_name: null,
    archived_file_name: null,
    archive_serial_number: null,
    ...overrides,
  };
}

function makeSnakeCaseStatistics() {
  return {
    documents_total: 42,
    documents_inbox: 5,
    inbox_tag: null,
    document_file_type_count: [],
    character_count: 100000,
  };
}

function makePaginatedResponse(results: unknown[], next: string | null = null, count?: number) {
  return {
    count: count ?? results.length,
    next,
    previous: null,
    results,
  };
}

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaperlessClient', () => {
  // ─── Auth header generation ──────────────────────────────────────────

  describe('auth header generation', () => {
    it('should use Token auth when token is provided', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'mytoken123' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Token mytoken123');
    });

    it('should use Basic auth when username and password are provided', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        username: 'admin',
        password: 'secret',
      });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      const [, options] = mockFetch.mock.calls[0];
      const expected = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      expect(options.headers['Authorization']).toBe(expected);
    });

    it('should prefer token over username/password when both are provided', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'mytoken',
        username: 'admin',
        password: 'secret',
      });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Token mytoken');
    });

    it('should not set Authorization header when no auth is provided', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should always include Accept header with version 9', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Accept']).toBe('application/json; version=9');
    });
  });

  // ─── Retry logic ─────────────────────────────────────────────────────

  describe('retry logic', () => {
    let sleepSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      sleepSpy = vi.spyOn(PaperlessClient.prototype as any, 'sleep').mockResolvedValue(undefined);
    });

    it('should retry on 500 and succeed on retry', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'fail' }, 500))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const response = await (client as any).fetchWithRetry('http://localhost:8000/api/test/');
      const body = await response.json();

      expect(body).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
    });

    it('should respect Retry-After header in seconds format for 429', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'rate limited' }, 429, { 'Retry-After': '3' }))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(3000);
    });

    it('should respect Retry-After header in HTTP date format for 429', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      const futureDate = new Date(Date.now() + 2000);
      const dateStr = futureDate.toUTCString();

      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ error: 'rate limited' }, 429, { 'Retry-After': dateStr }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry('http://localhost:8000/api/test/');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // The sleep should be called with a value approximately 2000ms (capped at 60000)
      const sleepMs = sleepSpy.mock.calls[0][0] as number;
      expect(sleepMs).toBeGreaterThan(0);
      expect(sleepMs).toBeLessThanOrEqual(60000);
    });

    it('should not retry on 400 and throw PaperlessApiError immediately', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'bad request' }, 400));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 and throw PaperlessAuthError immediately', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'unauthorized' }, 401));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessAuthError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 403 and throw PaperlessAuthError immediately', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'forbidden' }, 403));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessAuthError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on network error (TypeError) and succeed', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 2,
        timeout: 5000,
      });

      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const response = await (client as any).fetchWithRetry('http://localhost:8000/api/test/');
      const body = await response.json();

      expect(body).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
    });

    it('should give up after maxRetries on network error and throw PaperlessConnectionError', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 1,
        timeout: 5000,
      });

      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessConnectionError);

      expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('should give up after maxRetries on 5xx and throw PaperlessApiError', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 1,
        timeout: 5000,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'fail' }, 500))
        .mockResolvedValueOnce(mockResponse({ error: 'fail again' }, 502));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessApiError);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Pagination (async generator) ────────────────────────────────────

  describe('pagination', () => {
    beforeEach(() => {
      vi.spyOn(PaperlessClient.prototype as any, 'sleep').mockResolvedValue(undefined);
    });

    it('should yield arrays per page and handle multiple pages', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const doc1 = makeSnakeCaseDocument({ id: 1, title: 'Doc 1' });
      const doc2 = makeSnakeCaseDocument({ id: 2, title: 'Doc 2' });
      const doc3 = makeSnakeCaseDocument({ id: 3, title: 'Doc 3' });

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            makePaginatedResponse([doc1], 'http://localhost:8000/api/documents/?page=2', 3),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            makePaginatedResponse([doc2], 'http://localhost:8000/api/documents/?page=3', 3),
          ),
        )
        .mockResolvedValueOnce(mockResponse(makePaginatedResponse([doc3], null, 3)));

      const pages: any[][] = [];
      for await (const page of client.getDocuments({ pageSize: 1 })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(3);
      expect(pages[0][0].id).toBe(1);
      expect(pages[1][0].id).toBe(2);
      expect(pages[2][0].id).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should yield a single page and stop when next is null', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const doc = makeSnakeCaseDocument({ id: 1 });
      mockFetch.mockResolvedValueOnce(mockResponse(makePaginatedResponse([doc], null, 1)));

      const pages: any[][] = [];
      for await (const page of client.getDocuments()) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
      expect(pages[0]).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should yield empty array for zero results', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      mockFetch.mockResolvedValueOnce(mockResponse(makePaginatedResponse([], null, 0)));

      const pages: any[][] = [];
      for await (const page of client.getDocuments()) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual([]);
    });
  });

  // ─── Error classification ────────────────────────────────────────────

  describe('error classification', () => {
    beforeEach(() => {
      vi.spyOn(PaperlessClient.prototype as any, 'sleep').mockResolvedValue(undefined);
    });

    it('should throw PaperlessAuthError on 401', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'unauthorized' }, 401));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessAuthError);
    });

    it('should throw PaperlessAuthError on 403', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'forbidden' }, 403));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessAuthError);
    });

    it('should throw PaperlessApiError on 404', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'not found' }, 404));

      const err = await (client as any)
        .fetchWithRetry('http://localhost:8000/api/test/')
        .catch((e: Error) => e);

      expect(err).toBeInstanceOf(PaperlessApiError);
      expect(err).not.toBeInstanceOf(PaperlessAuthError);
    });

    it('should throw PaperlessConnectionError on network failure (TypeError)', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 0,
      });
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        (client as any).fetchWithRetry('http://localhost:8000/api/test/'),
      ).rejects.toThrow(PaperlessConnectionError);
    });

    it('should include statusCode and responseBody on PaperlessApiError', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'not found' }, 404));

      try {
        await (client as any).fetchWithRetry('http://localhost:8000/api/test/');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PaperlessApiError);
        const apiErr = err as PaperlessApiError;
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.responseBody).toContain('not found');
      }
    });

    it('PaperlessAuthError should be an instance of PaperlessApiError', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'unauthorized' }, 401));

      try {
        await (client as any).fetchWithRetry('http://localhost:8000/api/test/');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PaperlessAuthError);
        expect(err).toBeInstanceOf(PaperlessApiError);
      }
    });
  });

  // ─── URL normalization ───────────────────────────────────────────────

  describe('URL normalization', () => {
    it('should strip trailing slashes from base URL', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000/', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry((client as any).buildUrl('/api/documents/'));

      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:8000/api/documents/');
    });

    it('should handle URLs with no trailing slash', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry((client as any).buildUrl('/api/documents/'));

      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:8000/api/documents/');
    });

    it('should handle URLs with multiple trailing slashes', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000///', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

      await (client as any).fetchWithRetry((client as any).buildUrl('/api/documents/'));

      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:8000/api/documents/');
    });

    it('should correctly join base URL with API paths', () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000/', token: 'tok' });

      expect((client as any).buildUrl('/api/documents/')).toBe(
        'http://localhost:8000/api/documents/',
      );
      expect((client as any).buildUrl('api/documents/')).toBe(
        'http://localhost:8000/api/documents/',
      );
    });
  });

  // ─── testConnection ──────────────────────────────────────────────────

  describe('testConnection', () => {
    beforeEach(() => {
      vi.spyOn(PaperlessClient.prototype as any, 'sleep').mockResolvedValue(undefined);
    });

    it('should return success with documentCount on successful connection', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const doc = makeSnakeCaseDocument();
      mockFetch
        .mockResolvedValueOnce(mockResponse(makeSnakeCaseStatistics()))
        .mockResolvedValueOnce(mockResponse(makePaginatedResponse([doc], null, 42)));

      const result = await client.testConnection();

      expect(result).toEqual({
        success: true,
        version: 'unknown',
        documentCount: 42,
      });
    });

    it('should return auth failure on PaperlessAuthError', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'badtoken' });

      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'unauthorized' }, 401));

      const result = await client.testConnection();

      expect(result).toEqual({
        success: false,
        error: 'Authentication failed',
      });
    });

    it('should return connection failure on PaperlessConnectionError', async () => {
      const client = new PaperlessClient({
        url: 'http://localhost:8000',
        token: 'tok',
        maxRetries: 0,
      });

      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Connection failed/);
    });
  });

  // ─── fetchAllPaginated (via getTags/getCorrespondents/getDocumentTypes) ──

  describe('fetchAllPaginated', () => {
    beforeEach(() => {
      vi.spyOn(PaperlessClient.prototype as any, 'sleep').mockResolvedValue(undefined);
    });

    it('should fetch all pages and concatenate results via getTags', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const tag1 = {
        id: 1,
        name: 'Tag1',
        color: '#fff',
        text_color: '#000',
        is_inbox_tag: false,
        matching_algorithm: 0,
        match: '',
        document_count: 5,
      };
      const tag2 = {
        id: 2,
        name: 'Tag2',
        color: '#aaa',
        text_color: '#111',
        is_inbox_tag: true,
        matching_algorithm: 1,
        match: 'inbox',
        document_count: 3,
      };

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(makePaginatedResponse([tag1], 'http://localhost:8000/api/tags/?page=2', 2)),
        )
        .mockResolvedValueOnce(mockResponse(makePaginatedResponse([tag2], null, 2)));

      const tags = await client.getTags();

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag1');
      expect(tags[1].name).toBe('Tag2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle single page via getCorrespondents', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const corr = {
        id: 1,
        name: 'Acme Corp',
        matching_algorithm: 0,
        match: '',
        document_count: 10,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(makePaginatedResponse([corr], null, 1)));

      const correspondents = await client.getCorrespondents();

      expect(correspondents).toHaveLength(1);
      expect(correspondents[0].name).toBe('Acme Corp');
      expect(correspondents[0].documentCount).toBe(10);
    });

    it('should transform snake_case to camelCase via getDocumentTypes', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });

      const docType = {
        id: 1,
        name: 'Invoice',
        matching_algorithm: 2,
        match: 'invoice',
        document_count: 15,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(makePaginatedResponse([docType], null, 1)));

      const types = await client.getDocumentTypes();

      expect(types).toHaveLength(1);
      expect(types[0]).toEqual({
        id: 1,
        name: 'Invoice',
        matchingAlgorithm: 2,
        match: 'invoice',
        documentCount: 15,
      });
    });
  });

  // ─── deleteDocument ──────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('should succeed on 204 response', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(emptyResponse(204));

      await expect(client.deleteDocument(42)).resolves.toBeUndefined();

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:8000/api/documents/42/');
      expect(options.method).toBe('DELETE');
    });

    it('should throw PaperlessApiError on non-204 response', async () => {
      const client = new PaperlessClient({ url: 'http://localhost:8000', token: 'tok' });
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'something went wrong' }, 200));

      await expect(client.deleteDocument(42)).rejects.toThrow(PaperlessApiError);
    });
  });
});
