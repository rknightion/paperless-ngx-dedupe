import { PaperlessDedupeApiError, PaperlessDedupeNetworkError } from './errors.js';
import type { ApiErrorResponse, ApiSuccessResponse } from './types.js';

export interface HttpOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  timeout: number;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export async function request<T>(
  path: string,
  httpOptions: HttpOptions,
  reqOptions: RequestOptions = {},
): Promise<ApiSuccessResponse<T>> {
  const url = `${httpOptions.baseUrl}${path}`;
  const method = reqOptions.method ?? 'GET';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...reqOptions.headers,
  };

  let bodyStr: string | undefined;
  if (reqOptions.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(reqOptions.body);
  }

  let response: Response;
  try {
    response = await httpOptions.fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: reqOptions.signal ?? AbortSignal.timeout(httpOptions.timeout),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new PaperlessDedupeNetworkError('Request aborted', err);
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new PaperlessDedupeNetworkError('Request timed out', err);
    }
    throw new PaperlessDedupeNetworkError(
      err instanceof Error ? err.message : 'Network error',
      err,
    );
  }

  if (!response.ok) {
    let errorBody: ApiErrorResponse['error'];
    try {
      const json = (await response.json()) as ApiErrorResponse;
      errorBody = json.error;
    } catch {
      errorBody = {
        code: 'UNKNOWN',
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    throw new PaperlessDedupeApiError(response.status, errorBody);
  }

  return (await response.json()) as ApiSuccessResponse<T>;
}

export async function requestRaw(
  path: string,
  httpOptions: HttpOptions,
  reqOptions: RequestOptions = {},
): Promise<Response> {
  const url = `${httpOptions.baseUrl}${path}`;
  const method = reqOptions.method ?? 'GET';

  const headers: Record<string, string> = { ...reqOptions.headers };

  let bodyStr: string | undefined;
  if (reqOptions.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(reqOptions.body);
  }

  let response: Response;
  try {
    response = await httpOptions.fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: reqOptions.signal ?? AbortSignal.timeout(httpOptions.timeout),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new PaperlessDedupeNetworkError('Request aborted', err);
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new PaperlessDedupeNetworkError('Request timed out', err);
    }
    throw new PaperlessDedupeNetworkError(
      err instanceof Error ? err.message : 'Network error',
      err,
    );
  }

  if (!response.ok) {
    let errorBody: ApiErrorResponse['error'];
    try {
      const json = (await response.json()) as ApiErrorResponse;
      errorBody = json.error;
    } catch {
      errorBody = {
        code: 'UNKNOWN',
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    throw new PaperlessDedupeApiError(response.status, errorBody);
  }

  return response;
}
