import { describe, it, expect, vi } from 'vitest';
import { buildQueryString, request, requestRaw } from '../http.js';
import { PaperlessDedupeApiError, PaperlessDedupeNetworkError } from '../errors.js';
import type { HttpOptions } from '../http.js';

function createMockFetch(response: Partial<Response> & { ok: boolean }) {
  return vi.fn<typeof globalThis.fetch>().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    statusText: response.statusText ?? '',
    json: response.json ?? vi.fn(),
    text: response.text ?? vi.fn(),
    headers: response.headers ?? new Headers(),
    body: response.body ?? null,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: vi.fn(),
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as Response);
}

function makeHttpOptions(fetchFn: typeof globalThis.fetch): HttpOptions {
  return {
    baseUrl: 'http://localhost:3000',
    fetch: fetchFn,
    timeout: 5000,
  };
}

describe('buildQueryString', () => {
  it('returns empty string for empty params', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('builds query string from params', () => {
    const result = buildQueryString({ limit: 10, offset: 0 });
    expect(result).toBe('?limit=10&offset=0');
  });

  it('skips undefined and null values', () => {
    const result = buildQueryString({ limit: 10, offset: undefined, search: null });
    expect(result).toBe('?limit=10');
  });

  it('encodes special characters', () => {
    const result = buildQueryString({ search: 'hello world&more' });
    expect(result).toBe('?search=hello%20world%26more');
  });

  it('handles boolean values', () => {
    const result = buildQueryString({ autoAnalyze: true, confirm: false });
    expect(result).toBe('?autoAnalyze=true&confirm=false');
  });
});

describe('request', () => {
  it('sends GET request and parses JSON response', async () => {
    const mockFetch = createMockFetch({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { status: 'ok' } }),
    });

    const result = await request<{ status: string }>('/api/v1/health', makeHttpOptions(mockFetch));

    expect(result).toEqual({ data: { status: 'ok' } });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('sends POST request with JSON body', async () => {
    const mockFetch = createMockFetch({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { id: 'job-1' } }),
    });

    await request('/api/v1/sync', makeHttpOptions(mockFetch), {
      method: 'POST',
      body: { force: true },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/sync',
      expect.objectContaining({
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: '{"force":true}',
      }),
    );
  });

  it('throws PaperlessDedupeApiError on non-OK response with error body', async () => {
    const mockFetch = createMockFetch({
      ok: false,
      status: 404,
      json: vi
        .fn()
        .mockResolvedValue({ error: { code: 'NOT_FOUND', message: 'Document not found' } }),
    });

    await expect(request('/api/v1/documents/missing', makeHttpOptions(mockFetch))).rejects.toThrow(
      PaperlessDedupeApiError,
    );

    try {
      await request('/api/v1/documents/missing', makeHttpOptions(mockFetch));
    } catch (err) {
      const apiErr = err as PaperlessDedupeApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.message).toBe('Document not found');
    }
  });

  it('throws PaperlessDedupeApiError with fallback when body is not JSON', async () => {
    const mockFetch = createMockFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: vi.fn().mockRejectedValue(new Error('not json')),
    });

    try {
      await request('/api/v1/health', makeHttpOptions(mockFetch));
    } catch (err) {
      const apiErr = err as PaperlessDedupeApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.code).toBe('UNKNOWN');
      expect(apiErr.message).toBe('HTTP 502: Bad Gateway');
    }
  });

  it('throws PaperlessDedupeNetworkError on fetch failure', async () => {
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(request('/api/v1/health', makeHttpOptions(mockFetch))).rejects.toThrow(
      PaperlessDedupeNetworkError,
    );
  });

  it('throws PaperlessDedupeNetworkError on abort', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(abortError);

    try {
      await request('/api/v1/health', makeHttpOptions(mockFetch));
    } catch (err) {
      expect(err).toBeInstanceOf(PaperlessDedupeNetworkError);
      expect((err as PaperlessDedupeNetworkError).message).toBe('Request aborted');
    }
  });

  it('throws PaperlessDedupeNetworkError on timeout', async () => {
    const timeoutError = new DOMException('The operation timed out.', 'TimeoutError');
    const mockFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(timeoutError);

    try {
      await request('/api/v1/health', makeHttpOptions(mockFetch));
    } catch (err) {
      expect(err).toBeInstanceOf(PaperlessDedupeNetworkError);
      expect((err as PaperlessDedupeNetworkError).message).toBe('Request timed out');
    }
  });

  it('uses AbortSignal.timeout with configured timeout', async () => {
    const mockFetch = createMockFetch({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: {} }),
    });

    await request('/api/v1/health', makeHttpOptions(mockFetch));

    const call = mockFetch.mock.calls[0];
    const init = call[1]!;
    expect(init.signal).toBeDefined();
  });

  it('uses provided signal over default timeout', async () => {
    const mockFetch = createMockFetch({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: {} }),
    });
    const customSignal = AbortSignal.timeout(60000);

    await request('/api/v1/health', makeHttpOptions(mockFetch), { signal: customSignal });

    const call = mockFetch.mock.calls[0];
    const init = call[1]!;
    expect(init.signal).toBe(customSignal);
  });
});

describe('requestRaw', () => {
  it('returns the raw Response object on success', async () => {
    const mockFetch = createMockFetch({
      ok: true,
      text: vi.fn().mockResolvedValue('csv,data,here'),
    });

    const response = await requestRaw('/api/v1/export/duplicates.csv', makeHttpOptions(mockFetch));
    const text = await response.text();
    expect(text).toBe('csv,data,here');
  });

  it('throws PaperlessDedupeApiError on non-OK response', async () => {
    const mockFetch = createMockFetch({
      ok: false,
      status: 500,
      json: vi
        .fn()
        .mockResolvedValue({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
    });

    await expect(
      requestRaw('/api/v1/export/duplicates.csv', makeHttpOptions(mockFetch)),
    ).rejects.toThrow(PaperlessDedupeApiError);
  });
});
