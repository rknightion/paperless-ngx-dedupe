import type { ZodType } from 'zod';
import { createLogger } from '../logger.js';
import type { Logger } from '../logger.js';
import type {
  PaperlessConfig,
  PaperlessDocument,
  DocumentMetadata,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
  ConnectionTestResult,
} from './types.js';
import {
  paperlessDocumentSchema,
  documentMetadataSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paperlessStatisticsSchema,
  paginatedResponseSchema,
} from './schemas.js';
import { PaperlessApiError, PaperlessAuthError, PaperlessConnectionError } from './errors.js';

export class PaperlessClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(config: PaperlessConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');

    this.headers = {
      Accept: 'application/json; version=9',
    };
    if (config.token) {
      this.headers['Authorization'] = `Token ${config.token}`;
    } else if (config.username && config.password) {
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.headers['Authorization'] = `Basic ${encoded}`;
    }

    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = createLogger('paperless-client');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    attempt: number = 0,
  ): Promise<Response> {
    const mergedHeaders = { ...this.headers, ...options.headers };

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof DOMException &&
          (error.name === 'TimeoutError' || error.name === 'AbortError'))
      ) {
        if (attempt < this.maxRetries) {
          const backoff = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 30000);
          this.logger.warn(
            { attempt: attempt + 1, maxRetries: this.maxRetries, backoffMs: Math.round(backoff) },
            'Network error, retrying request',
          );
          await this.sleep(backoff);
          return this.fetchWithRetry(url, options, attempt + 1);
        }
        throw new PaperlessConnectionError(
          `Failed to connect after ${this.maxRetries} retries: ${(error as Error).message}`,
          error as Error,
        );
      }
      throw new PaperlessConnectionError(
        `Connection error: ${(error as Error).message}`,
        error instanceof Error ? error : undefined,
      );
    }

    if (response.status === 401 || response.status === 403) {
      const body = await response.text();
      throw new PaperlessAuthError(
        `Authentication failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    if (response.status === 429) {
      if (attempt < this.maxRetries) {
        let retryAfterMs = 5000;
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          if (!isNaN(seconds)) {
            retryAfterMs = Math.min(seconds * 1000, 60000);
          } else {
            const date = new Date(retryAfter);
            if (!isNaN(date.getTime())) {
              retryAfterMs = Math.min(Math.max(date.getTime() - Date.now(), 0), 60000);
            }
          }
        }
        this.logger.warn(
          { attempt: attempt + 1, maxRetries: this.maxRetries, retryAfterMs },
          'Rate limited (429), retrying after delay',
        );
        await this.sleep(retryAfterMs);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      const body = await response.text();
      throw new PaperlessApiError(
        `Rate limited: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    if (response.status >= 500 && response.status < 600) {
      if (attempt < this.maxRetries) {
        const backoff = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 30000);
        this.logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            statusCode: response.status,
            backoffMs: Math.round(backoff),
          },
          'Server error, retrying request',
        );
        await this.sleep(backoff);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      const body = await response.text();
      throw new PaperlessApiError(
        `Server error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    if (response.status >= 400 && response.status < 500) {
      const body = await response.text();
      throw new PaperlessApiError(
        `Client error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return response;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const statsResponse = await this.fetchWithRetry(this.buildUrl('/api/statistics/'));
      const statsJson = await statsResponse.json();
      paperlessStatisticsSchema.parse(statsJson);

      const docsResponse = await this.fetchWithRetry(this.buildUrl('/api/documents/?page_size=1'));
      const docsJson = await docsResponse.json();
      const paginated = paginatedResponseSchema(paperlessDocumentSchema).parse(docsJson);

      return {
        success: true,
        version: 'unknown',
        documentCount: paginated.count,
      };
    } catch (error) {
      if (error instanceof PaperlessAuthError) {
        return { success: false, error: 'Authentication failed' };
      }
      if (error instanceof PaperlessConnectionError) {
        return { success: false, error: `Connection failed: ${error.message}` };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async *getDocuments(options?: {
    ordering?: string;
    pageSize?: number;
  }): AsyncGenerator<PaperlessDocument[]> {
    const pageSize = options?.pageSize ?? 100;
    const ordering = options?.ordering ?? '-modified';
    const schema = paginatedResponseSchema(paperlessDocumentSchema);
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      this.logger.debug({ page, pageSize, ordering }, 'Fetching documents page');
      const response = await this.fetchWithRetry(
        this.buildUrl(`/api/documents/?page=${page}&page_size=${pageSize}&ordering=${ordering}`),
      );
      const json = await response.json();
      const parsed = schema.parse(json);

      yield parsed.results;

      hasNext = parsed.next !== null;
      page++;
    }
  }

  async getDocumentContent(id: number): Promise<string> {
    const response = await this.fetchWithRetry(this.buildUrl(`/api/documents/${id}/`));
    const json = await response.json();
    const doc = paperlessDocumentSchema.parse(json);
    return doc.content;
  }

  async getDocumentMetadata(id: number): Promise<DocumentMetadata> {
    const response = await this.fetchWithRetry(this.buildUrl(`/api/documents/${id}/metadata/`));
    const json = await response.json();
    return documentMetadataSchema.parse(json);
  }

  async getTags(): Promise<PaperlessTag[]> {
    return this.fetchAllPaginated('/api/tags/', paperlessTagSchema);
  }

  async getCorrespondents(): Promise<PaperlessCorrespondent[]> {
    return this.fetchAllPaginated('/api/correspondents/', paperlessCorrespondentSchema);
  }

  async getDocumentTypes(): Promise<PaperlessDocumentType[]> {
    return this.fetchAllPaginated('/api/document_types/', paperlessDocumentTypeSchema);
  }

  async getStatistics(): Promise<PaperlessStatistics> {
    const response = await this.fetchWithRetry(this.buildUrl('/api/statistics/'));
    const json = await response.json();
    return paperlessStatisticsSchema.parse(json);
  }

  async deleteDocument(id: number): Promise<void> {
    const response = await this.fetchWithRetry(this.buildUrl(`/api/documents/${id}/`), {
      method: 'DELETE',
    });
    if (response.status !== 204) {
      const body = await response.text();
      throw new PaperlessApiError(
        `Expected 204 for DELETE, got ${response.status}`,
        response.status,
        body,
      );
    }
  }

  private async fetchAllPaginated<T>(path: string, schema: ZodType): Promise<T[]> {
    const paginatedSchema = paginatedResponseSchema(schema);
    const allResults: T[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const separator = path.includes('?') ? '&' : '?';
      const url = this.buildUrl(`${path}${separator}page=${page}&page_size=100`);
      const response = await this.fetchWithRetry(url);
      const json = await response.json();
      const parsed = paginatedSchema.parse(json);

      allResults.push(...(parsed.results as T[]));

      hasNext = parsed.next !== null;
      page++;
    }

    return allResults;
  }
}
