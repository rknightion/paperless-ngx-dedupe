import { describe, it, expect } from 'vitest';
import {
  paperlessDocumentSchema,
  documentMetadataSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paperlessStatisticsSchema,
  paperlessConfigSchema,
  paginatedResponseSchema,
  toPaperlessConfig,
} from '../schemas.js';

describe('snake_case to camelCase transformation', () => {
  it('paperlessDocumentSchema transforms document fields', () => {
    const input = {
      id: 1,
      title: 'Test Doc',
      content: 'body',
      tags: [1, 2],
      correspondent: 3,
      document_type: 4,
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-02T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
      original_file_name: 'test.pdf',
      archived_file_name: 'test_archived.pdf',
      archive_serial_number: 42,
    };
    const result = paperlessDocumentSchema.parse(input);
    expect(result.documentType).toBe(4);
    expect(result.originalFileName).toBe('test.pdf');
    expect(result.archivedFileName).toBe('test_archived.pdf');
    expect(result.archiveSerialNumber).toBe(42);
  });

  it('paperlessTagSchema transforms tag fields', () => {
    const input = {
      id: 1,
      name: 'Inbox',
      color: '#ff0000',
      text_color: '#ffffff',
      is_inbox_tag: true,
      matching_algorithm: 2,
      match: 'inbox',
      document_count: 10,
    };
    const result = paperlessTagSchema.parse(input);
    expect(result.textColor).toBe('#ffffff');
    expect(result.isInboxTag).toBe(true);
    expect(result.matchingAlgorithm).toBe(2);
    expect(result.documentCount).toBe(10);
  });

  it('paperlessCorrespondentSchema transforms correspondent fields', () => {
    const input = {
      id: 1,
      name: 'ACME Corp',
      matching_algorithm: 3,
      match: 'acme',
      document_count: 5,
    };
    const result = paperlessCorrespondentSchema.parse(input);
    expect(result.matchingAlgorithm).toBe(3);
    expect(result.documentCount).toBe(5);
  });

  it('paperlessDocumentTypeSchema transforms document type fields', () => {
    const input = {
      id: 1,
      name: 'Invoice',
      matching_algorithm: 1,
      match: 'invoice',
      document_count: 20,
    };
    const result = paperlessDocumentTypeSchema.parse(input);
    expect(result.matchingAlgorithm).toBe(1);
    expect(result.documentCount).toBe(20);
  });

  it('documentMetadataSchema transforms metadata fields', () => {
    const input = {
      original_checksum: 'abc123',
      original_size: 1024,
      original_mime_type: 'application/pdf',
      media_filename: 'test.pdf',
      has_archive_version: true,
      archive_checksum: 'def456',
      archive_size: 2048,
      archive_media_filename: 'test_archive.pdf',
    };
    const result = documentMetadataSchema.parse(input);
    expect(result.originalChecksum).toBe('abc123');
    expect(result.originalSize).toBe(1024);
    expect(result.originalMimeType).toBe('application/pdf');
    expect(result.mediaFilename).toBe('test.pdf');
    expect(result.hasArchiveVersion).toBe(true);
    expect(result.archiveChecksum).toBe('def456');
    expect(result.archiveSize).toBe(2048);
    expect(result.archiveMediaFilename).toBe('test_archive.pdf');
  });

  it('paperlessStatisticsSchema transforms statistics fields including nested', () => {
    const input = {
      documents_total: 100,
      documents_inbox: 5,
      inbox_tag: 1,
      document_file_type_count: [
        { mime_type: 'application/pdf', count: 80 },
        { mime_type: 'image/png', count: 20 },
      ],
      character_count: 500000,
    };
    const result = paperlessStatisticsSchema.parse(input);
    expect(result.documentsTotal).toBe(100);
    expect(result.documentFileTypeCount).toEqual([
      { mimeType: 'application/pdf', count: 80 },
      { mimeType: 'image/png', count: 20 },
    ]);
  });
});

describe('missing optional fields get defaults', () => {
  it('document with missing content gets empty string', () => {
    const input = {
      id: 1,
      title: 'Test',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
    };
    const result = paperlessDocumentSchema.parse(input);
    expect(result.content).toBe('');
  });

  it('document with missing tags gets empty array', () => {
    const input = {
      id: 1,
      title: 'Test',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
    };
    const result = paperlessDocumentSchema.parse(input);
    expect(result.tags).toEqual([]);
  });

  it('tag with missing color gets default #a6cee3', () => {
    const input = { id: 1, name: 'Test' };
    const result = paperlessTagSchema.parse(input);
    expect(result.color).toBe('#a6cee3');
  });

  it('tag with missing text_color gets default #000000', () => {
    const input = { id: 1, name: 'Test' };
    const result = paperlessTagSchema.parse(input);
    expect(result.textColor).toBe('#000000');
  });

  it('tag with missing is_inbox_tag gets false', () => {
    const input = { id: 1, name: 'Test' };
    const result = paperlessTagSchema.parse(input);
    expect(result.isInboxTag).toBe(false);
  });

  it('statistics with missing document_file_type_count gets empty array', () => {
    const input = {
      documents_total: 50,
      documents_inbox: 3,
      character_count: 10000,
    };
    const result = paperlessStatisticsSchema.parse(input);
    expect(result.documentFileTypeCount).toEqual([]);
  });
});

describe('invalid data rejected', () => {
  it('document missing required id throws', () => {
    const input = {
      title: 'Test',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
    };
    expect(() => paperlessDocumentSchema.parse(input)).toThrow();
  });

  it('document missing required title throws', () => {
    const input = {
      id: 1,
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
    };
    expect(() => paperlessDocumentSchema.parse(input)).toThrow();
  });

  it('tag missing required name throws', () => {
    const input = { id: 1 };
    expect(() => paperlessTagSchema.parse(input)).toThrow();
  });

  it('statistics missing required documents_total throws', () => {
    const input = {
      documents_inbox: 3,
      character_count: 10000,
    };
    expect(() => paperlessStatisticsSchema.parse(input)).toThrow();
  });

  it('document with wrong type for id throws', () => {
    const input = {
      id: 'not-a-number',
      title: 'Test',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
    };
    expect(() => paperlessDocumentSchema.parse(input)).toThrow();
  });
});

describe('config schema validation', () => {
  it('token auth passes', () => {
    const input = { url: 'https://example.com', token: 'abc' };
    const result = paperlessConfigSchema.parse(input);
    expect(result.url).toBe('https://example.com');
    expect(result.token).toBe('abc');
  });

  it('username+password auth passes', () => {
    const input = { url: 'https://example.com', username: 'user', password: 'pass' };
    const result = paperlessConfigSchema.parse(input);
    expect(result.username).toBe('user');
    expect(result.password).toBe('pass');
  });

  it('missing auth rejected', () => {
    const input = { url: 'https://example.com' };
    const result = paperlessConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('invalid URL rejected', () => {
    const input = { url: 'not-a-url', token: 'abc' };
    const result = paperlessConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('token-only (no username/password) passes', () => {
    const input = { url: 'https://example.com', token: 'abc' };
    const result = paperlessConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('toPaperlessConfig bridge function', () => {
  it('maps AppConfig fields to PaperlessConfig correctly', () => {
    const appConfig = {
      DATABASE_URL: './data/test.db',
      PAPERLESS_URL: 'https://paperless.example.com',
      PAPERLESS_API_TOKEN: 'my-token',
      PAPERLESS_USERNAME: undefined,
      PAPERLESS_PASSWORD: undefined,
      PORT: 3000,
      LOG_LEVEL: 'info' as const,
      CORS_ALLOW_ORIGIN: '',
      AUTO_MIGRATE: true,
      PAPERLESS_METRICS_ENABLED: false,
      SYNC_METADATA_CONCURRENCY: 10,
    };
    const result = toPaperlessConfig(appConfig);
    expect(result.url).toBe('https://paperless.example.com');
    expect(result.token).toBe('my-token');
    expect(result.username).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it('handles undefined optional fields', () => {
    const appConfig = {
      DATABASE_URL: './data/test.db',
      PAPERLESS_URL: 'https://paperless.example.com',
      PAPERLESS_API_TOKEN: undefined,
      PAPERLESS_USERNAME: 'admin',
      PAPERLESS_PASSWORD: 'secret',
      PORT: 3000,
      LOG_LEVEL: 'info' as const,
      CORS_ALLOW_ORIGIN: '',
      AUTO_MIGRATE: true,
      PAPERLESS_METRICS_ENABLED: false,
      SYNC_METADATA_CONCURRENCY: 10,
    };
    const result = toPaperlessConfig(appConfig);
    expect(result.url).toBe('https://paperless.example.com');
    expect(result.token).toBeUndefined();
    expect(result.username).toBe('admin');
    expect(result.password).toBe('secret');
  });
});

describe('paginatedResponseSchema', () => {
  it('parses valid paginated response', () => {
    const schema = paginatedResponseSchema(paperlessTagSchema);
    const input = {
      count: 2,
      next: 'https://example.com/api/tags/?page=2',
      previous: null,
      results: [
        { id: 1, name: 'Tag A' },
        { id: 2, name: 'Tag B' },
      ],
    };
    const result = schema.parse(input);
    expect(result.count).toBe(2);
    expect(result.next).toBe('https://example.com/api/tags/?page=2');
    expect(result.previous).toBeNull();
    expect(result.results).toHaveLength(2);
  });

  it('transforms nested items through the item schema', () => {
    const schema = paginatedResponseSchema(paperlessTagSchema);
    const input = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: 'Inbox',
          text_color: '#ffffff',
          is_inbox_tag: true,
          document_count: 5,
        },
      ],
    };
    const result = schema.parse(input);
    expect(result.results[0].textColor).toBe('#ffffff');
    expect(result.results[0].isInboxTag).toBe(true);
    expect(result.results[0].documentCount).toBe(5);
  });

  it('missing next/previous default to null', () => {
    const schema = paginatedResponseSchema(paperlessTagSchema);
    const input = {
      count: 0,
      results: [],
    };
    const result = schema.parse(input);
    expect(result.next).toBeNull();
    expect(result.previous).toBeNull();
  });
});
