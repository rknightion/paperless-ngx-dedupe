import { describe, it, expect } from 'vitest';
import {
  paperlessStatusSchema,
  paperlessStoragePathSchema,
  paperlessTaskSchema,
  paperlessRemoteVersionSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
} from '../schemas.js';

describe('paperlessStatusSchema', () => {
  it('transforms status response', () => {
    const input = {
      storage: { total: 1000000, available: 500000 },
      database: {
        status: 'OK',
        migration_status: { unapplied_migrations: ['0001', '0002'] },
      },
      tasks: {
        redis_status: 'OK',
        celery_status: 'OK',
        index_status: 'OK',
        index_last_modified: '2024-01-01T00:00:00Z',
        classifier_status: 'OK',
        classifier_last_trained: '2024-06-01T12:00:00Z',
        sanity_check_status: 'ERROR',
        sanity_check_last_run: null,
      },
    };
    const result = paperlessStatusSchema.parse(input);
    expect(result.storageTotal).toBe(1000000);
    expect(result.storageAvailable).toBe(500000);
    expect(result.databaseStatus).toBe('OK');
    expect(result.databaseUnappliedMigrations).toBe(2);
    expect(result.redisStatus).toBe('OK');
    expect(result.celeryStatus).toBe('OK');
    expect(result.indexLastModified).toBe('2024-01-01T00:00:00Z');
    expect(result.classifierLastTrained).toBe('2024-06-01T12:00:00Z');
    expect(result.sanityCheckStatus).toBe('ERROR');
    expect(result.sanityCheckLastRun).toBeNull();
  });

  it('defaults missing migration_status', () => {
    const input = {
      storage: { total: 100, available: 50 },
      database: { status: 'OK' },
      tasks: {},
    };
    const result = paperlessStatusSchema.parse(input);
    expect(result.databaseUnappliedMigrations).toBe(0);
    expect(result.redisStatus).toBe('');
  });
});

describe('paperlessStoragePathSchema', () => {
  it('transforms storage path response', () => {
    const input = { id: 1, name: 'Archive', slug: 'archive', document_count: 15 };
    const result = paperlessStoragePathSchema.parse(input);
    expect(result.id).toBe(1);
    expect(result.name).toBe('Archive');
    expect(result.slug).toBe('archive');
    expect(result.documentCount).toBe(15);
  });

  it('defaults missing slug', () => {
    const input = { id: 2, name: 'Inbox' };
    const result = paperlessStoragePathSchema.parse(input);
    expect(result.slug).toBe('');
    expect(result.documentCount).toBe(0);
  });
});

describe('paperlessTaskSchema', () => {
  it('transforms task response', () => {
    const input = {
      id: 42,
      task_id: 'abc-123',
      task_file_name: 'doc.pdf',
      type: 'file',
      status: 'SUCCESS',
      date_created: '2024-01-01T00:00:00Z',
      date_done: '2024-01-01T00:01:00Z',
    };
    const result = paperlessTaskSchema.parse(input);
    expect(result.id).toBe(42);
    expect(result.taskId).toBe('abc-123');
    expect(result.taskFileName).toBe('doc.pdf');
    expect(result.type).toBe('file');
    expect(result.status).toBe('SUCCESS');
    expect(result.created).toBe('2024-01-01T00:00:00Z');
    expect(result.done).toBe('2024-01-01T00:01:00Z');
  });

  it('handles null optional fields', () => {
    const input = { id: 1, task_id: 'x', status: 'PENDING' };
    const result = paperlessTaskSchema.parse(input);
    expect(result.taskFileName).toBeNull();
    expect(result.created).toBeNull();
    expect(result.done).toBeNull();
    expect(result.type).toBe('');
  });
});

describe('paperlessRemoteVersionSchema', () => {
  it('transforms remote version response', () => {
    const input = { version: '2.0.0', update_available: true };
    const result = paperlessRemoteVersionSchema.parse(input);
    expect(result.version).toBe('2.0.0');
    expect(result.updateAvailable).toBe(true);
  });

  it('parses when no update available', () => {
    const input = { version: '1.0.0', update_available: false };
    const result = paperlessRemoteVersionSchema.parse(input);
    expect(result.updateAvailable).toBe(false);
  });
});

describe('slug field added to existing schemas', () => {
  it('tagSchema includes slug', () => {
    const input = { id: 1, name: 'Test', slug: 'test' };
    const result = paperlessTagSchema.parse(input);
    expect(result.slug).toBe('test');
  });

  it('tagSchema defaults slug to empty string', () => {
    const input = { id: 1, name: 'Test' };
    const result = paperlessTagSchema.parse(input);
    expect(result.slug).toBe('');
  });

  it('correspondentSchema includes slug and lastCorrespondence', () => {
    const input = {
      id: 1,
      name: 'ACME',
      slug: 'acme',
      last_correspondence: '2024-06-01T00:00:00Z',
    };
    const result = paperlessCorrespondentSchema.parse(input);
    expect(result.slug).toBe('acme');
    expect(result.lastCorrespondence).toBe('2024-06-01T00:00:00Z');
  });

  it('correspondentSchema defaults slug and lastCorrespondence', () => {
    const input = { id: 1, name: 'ACME' };
    const result = paperlessCorrespondentSchema.parse(input);
    expect(result.slug).toBe('');
    expect(result.lastCorrespondence).toBeNull();
  });

  it('documentTypeSchema includes slug', () => {
    const input = { id: 1, name: 'Invoice', slug: 'invoice' };
    const result = paperlessDocumentTypeSchema.parse(input);
    expect(result.slug).toBe('invoice');
  });

  it('documentTypeSchema defaults slug to empty string', () => {
    const input = { id: 1, name: 'Invoice' };
    const result = paperlessDocumentTypeSchema.parse(input);
    expect(result.slug).toBe('');
  });
});
