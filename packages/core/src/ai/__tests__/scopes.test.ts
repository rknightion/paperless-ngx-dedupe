import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import {
  getFailedDocumentIds,
  resolveProcessScope,
  resolveResultIdsForApplyScope,
} from '../scopes.js';

function seedData(db: AppDatabase): string[] {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice A',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Receipt B',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-3',
        paperlessId: 3,
        title: 'Contract C',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      },
    ])
    .run();

  const ids: string[] = [];

  const r1 = db
    .insert(aiProcessingResult)
    .values({
      documentId: 'doc-1',
      paperlessId: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
      suggestedCorrespondent: 'Amazon',
      appliedStatus: 'pending_review',
      createdAt: '2024-01-01T00:00:00Z',
    })
    .returning()
    .get();
  ids.push(r1.id);

  const r2 = db
    .insert(aiProcessingResult)
    .values({
      documentId: 'doc-2',
      paperlessId: 2,
      provider: 'openai',
      model: 'gpt-4o-mini',
      suggestedCorrespondent: 'Tesco',
      appliedStatus: 'applied',
      createdAt: '2024-01-02T00:00:00Z',
    })
    .returning()
    .get();
  ids.push(r2.id);

  const r3 = db
    .insert(aiProcessingResult)
    .values({
      documentId: 'doc-3',
      paperlessId: 3,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      appliedStatus: 'failed',
      errorMessage: 'Extraction failed',
      createdAt: '2024-01-03T00:00:00Z',
    })
    .returning()
    .get();
  ids.push(r3.id);

  return ids;
}

describe('getFailedDocumentIds', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedData(db);
  });

  it('returns only document IDs with failed status', () => {
    const ids = getFailedDocumentIds(db);
    expect(ids).toEqual(['doc-3']);
  });

  it('returns empty array when no failures', () => {
    db.delete(aiProcessingResult).run();
    const ids = getFailedDocumentIds(db);
    expect(ids).toEqual([]);
  });
});

describe('resolveProcessScope', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedData(db);
  });

  it('resolves new_only scope', () => {
    const result = resolveProcessScope(db, { type: 'new_only' });
    expect(result).toEqual({ reprocess: false });
  });

  it('resolves full_reprocess scope', () => {
    const result = resolveProcessScope(db, { type: 'full_reprocess' });
    expect(result).toEqual({ reprocess: true });
  });

  it('resolves failed_only scope to failed document IDs', () => {
    const result = resolveProcessScope(db, { type: 'failed_only' });
    expect(result.reprocess).toBe(false);
    expect(result.documentIds).toEqual(['doc-3']);
  });

  it('resolves selected_document_ids scope', () => {
    const result = resolveProcessScope(db, {
      type: 'selected_document_ids',
      documentIds: ['doc-1', 'doc-2'],
    });
    expect(result.reprocess).toBe(false);
    expect(result.documentIds).toEqual(['doc-1', 'doc-2']);
  });

  it('resolves current_filter scope', () => {
    const result = resolveProcessScope(db, {
      type: 'current_filter',
      filters: { status: 'pending_review' },
    });
    expect(result.reprocess).toBe(false);
    expect(result.documentIds).toHaveLength(1);
    expect(result.documentIds).toContain('doc-1');
  });
});

describe('resolveResultIdsForApplyScope', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedData(db);
  });

  it('resolves selected_result_ids scope', () => {
    const ids = resolveResultIdsForApplyScope(db, {
      type: 'selected_result_ids',
      resultIds: [resultIds[0], resultIds[1]],
    });
    expect(ids).toEqual([resultIds[0], resultIds[1]]);
  });

  it('resolves all_pending scope', () => {
    const ids = resolveResultIdsForApplyScope(db, { type: 'all_pending' });
    expect(ids).toHaveLength(1);
    expect(ids).toContain(resultIds[0]); // Only the pending_review one
  });

  it('resolves current_filter scope', () => {
    const ids = resolveResultIdsForApplyScope(db, {
      type: 'current_filter',
      filters: { status: 'applied' },
    });
    expect(ids).toHaveLength(1);
    expect(ids).toContain(resultIds[1]); // The applied one
  });
});
