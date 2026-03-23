import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import {
  getAiResults,
  getAiResult,
  getAiStats,
  markAiResultApplied,
  markAiResultRejected,
  batchMarkApplied,
  batchMarkRejected,
} from '../queries.js';

function seedDocumentsAndResults(db: AppDatabase): string[] {
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
      model: 'gpt-5.4-mini',
      suggestedCorrespondent: 'Amazon',
      suggestedDocumentType: 'Invoice',
      suggestedTagsJson: '["finance","shopping"]',
      confidenceJson: '{"correspondent":0.9,"documentType":0.95,"tags":0.8}',
      appliedStatus: 'pending',
      promptTokens: 100,
      completionTokens: 50,
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
      model: 'gpt-5.4-mini',
      suggestedCorrespondent: 'Tesco',
      suggestedDocumentType: 'Receipt',
      suggestedTagsJson: '["groceries"]',
      confidenceJson: '{"correspondent":0.85,"documentType":0.9,"tags":0.7}',
      appliedStatus: 'applied',
      appliedAt: '2024-01-02T00:00:00Z',
      promptTokens: 80,
      completionTokens: 40,
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
      suggestedCorrespondent: null,
      suggestedDocumentType: null,
      suggestedTagsJson: null,
      confidenceJson: null,
      appliedStatus: 'rejected',
      errorMessage: 'Extraction failed: timeout',
      promptTokens: 60,
      completionTokens: 0,
      createdAt: '2024-01-03T00:00:00Z',
    })
    .returning()
    .get();
  ids.push(r3.id);

  return ids;
}

describe('getAiResults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('returns all results with parsed JSON', () => {
    const { items, total } = getAiResults(db);
    expect(total).toBe(3);
    expect(items).toHaveLength(3);

    // Results ordered by createdAt DESC, so doc-3 first
    const doc1Result = items.find((i) => i.documentId === 'doc-1')!;
    expect(doc1Result.suggestedCorrespondent).toBe('Amazon');
    expect(doc1Result.suggestedTags).toEqual(['finance', 'shopping']);
    expect(doc1Result.confidence).toEqual({
      correspondent: 0.9,
      documentType: 0.95,
      tags: 0.8,
    });
  });

  it('filters by status', () => {
    const { items, total } = getAiResults(db, { status: 'pending' });
    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].documentId).toBe('doc-1');
  });

  it('filters by search term (title LIKE)', () => {
    const { items, total } = getAiResults(db, { search: 'Invoice' });
    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].documentTitle).toBe('Invoice A');
  });

  it('paginates with limit and offset', () => {
    const page1 = getAiResults(db, {}, 2, 0);
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = getAiResults(db, {}, 2, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it('returns total count independent of pagination', () => {
    const { total } = getAiResults(db, {}, 1, 0);
    expect(total).toBe(3);
  });

  it('handles null suggestedTags and confidence gracefully', () => {
    const doc3Result = getAiResults(db, { status: 'rejected' }).items[0];
    expect(doc3Result.suggestedTags).toEqual([]);
    expect(doc3Result.confidence).toBeNull();
  });
});

describe('getAiResult', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('returns single result by ID', () => {
    const result = getAiResult(db, resultIds[0]);
    expect(result).not.toBeNull();
    expect(result!.documentId).toBe('doc-1');
    expect(result!.suggestedCorrespondent).toBe('Amazon');
    expect(result!.suggestedTags).toEqual(['finance', 'shopping']);
  });

  it('returns null for missing ID', () => {
    const result = getAiResult(db, 'nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('getAiStats', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('computes counts by status', () => {
    const stats = getAiStats(db);
    expect(stats.totalProcessed).toBe(3);
    expect(stats.pendingReview).toBe(1);
    expect(stats.applied).toBe(1);
    expect(stats.rejected).toBe(1);
  });

  it('counts failed results (errorMessage IS NOT NULL)', () => {
    const stats = getAiStats(db);
    expect(stats.failed).toBe(1); // doc-3 has errorMessage
  });

  it('sums prompt and completion tokens', () => {
    const stats = getAiStats(db);
    expect(stats.totalPromptTokens).toBe(240); // 100 + 80 + 60
    expect(stats.totalCompletionTokens).toBe(90); // 50 + 40 + 0
  });

  it('returns all zeros for empty database', async () => {
    const handle = createDatabaseWithHandle(':memory:');
    const emptyDb = handle.db;
    await migrateDatabase(handle.sqlite);

    const stats = getAiStats(emptyDb);
    expect(stats.totalProcessed).toBe(0);
    expect(stats.pendingReview).toBe(0);
    expect(stats.applied).toBe(0);
    expect(stats.rejected).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.totalPromptTokens).toBe(0);
    expect(stats.totalCompletionTokens).toBe(0);
  });
});

describe('markAiResultApplied', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('sets status to "applied" when all 3 fields are provided', () => {
    markAiResultApplied(db, resultIds[0], ['correspondent', 'documentType', 'tags']);
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('applied');
    expect(result!.appliedAt).toBeTruthy();
  });

  it('sets status to "partial" when a subset of fields is provided', () => {
    markAiResultApplied(db, resultIds[0], ['correspondent']);
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('partial');
  });
});

describe('markAiResultRejected', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('sets status to "rejected"', () => {
    markAiResultRejected(db, resultIds[0]);
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('rejected');
    expect(result!.appliedAt).toBeTruthy();
  });
});

describe('batchMarkApplied', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('updates all provided IDs', () => {
    batchMarkApplied(db, [resultIds[0], resultIds[2]], ['correspondent', 'documentType', 'tags']);
    const r1 = getAiResult(db, resultIds[0]);
    const r3 = getAiResult(db, resultIds[2]);
    expect(r1!.appliedStatus).toBe('applied');
    expect(r3!.appliedStatus).toBe('applied');
    // r2 should remain unchanged
    const r2 = getAiResult(db, resultIds[1]);
    expect(r2!.appliedStatus).toBe('applied'); // was already 'applied'
  });

  it('sets partial status for subset of fields', () => {
    batchMarkApplied(db, [resultIds[0]], ['tags']);
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('partial');
  });
});

describe('batchMarkRejected', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('updates all provided IDs to rejected', () => {
    batchMarkRejected(db, [resultIds[0], resultIds[1]]);
    const r1 = getAiResult(db, resultIds[0]);
    const r2 = getAiResult(db, resultIds[1]);
    expect(r1!.appliedStatus).toBe('rejected');
    expect(r2!.appliedStatus).toBe('rejected');
  });
});
