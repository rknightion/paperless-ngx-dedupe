import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
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
  markAiResultFailed,
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
      appliedStatus: 'pending_review',
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
      appliedStatus: 'failed',
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
      title: 0,
      correspondent: 0.9,
      documentType: 0.95,
      tags: 0.8,
    });
  });

  it('filters by status', () => {
    const { items, total } = getAiResults(db, { status: 'pending_review' });
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
    const doc3Result = getAiResults(db, { status: 'failed' }).items[0];
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

  it('returns detail fields (evidence, failureType, tokens, processingTimeMs, appliedFields)', () => {
    // Add evidence and processingTimeMs to r1
    db.update(aiProcessingResult)
      .set({
        evidence: 'Invoice from Amazon dated 2024-01-01',
        processingTimeMs: 1500,
        appliedFieldsJson: '["correspondent","tags"]',
      })
      .where(eq(aiProcessingResult.id, resultIds[0]))
      .run();

    const result = getAiResult(db, resultIds[0]);
    expect(result).not.toBeNull();
    expect(result!.evidence).toBe('Invoice from Amazon dated 2024-01-01');
    expect(result!.promptTokens).toBe(100);
    expect(result!.completionTokens).toBe(50);
    expect(result!.processingTimeMs).toBe(1500);
    expect(result!.appliedFields).toEqual(['correspondent', 'tags']);
  });

  it('returns failureType for failed results', () => {
    db.update(aiProcessingResult)
      .set({ failureType: 'timeout' })
      .where(eq(aiProcessingResult.id, resultIds[2]))
      .run();

    const result = getAiResult(db, resultIds[2]);
    expect(result).not.toBeNull();
    expect(result!.failureType).toBe('timeout');
    expect(result!.errorMessage).toBe('Extraction failed: timeout');
  });
});

describe('getAiResults - sorting', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('sorts by newest (default)', () => {
    const { items } = getAiResults(db);
    expect(items[0].createdAt).toBe('2024-01-03T00:00:00Z');
  });

  it('sorts by oldest', () => {
    const { items } = getAiResults(db, { sort: 'oldest' });
    expect(items[0].createdAt).toBe('2024-01-01T00:00:00Z');
  });

  it('sorts by confidence ascending', () => {
    // r1 avg: (0.9+0.95+0.8)/3 = 0.883, r2 avg: (0.85+0.9+0.7)/3 = 0.817
    // r3 has null confidence -> NULL sorts first in ASC
    const { items } = getAiResults(db, { sort: 'confidence_asc' });
    const nonNullItems = items.filter((i) => i.confidence !== null);
    expect(nonNullItems[0].documentId).toBe('doc-2');
    expect(nonNullItems[1].documentId).toBe('doc-1');
  });

  it('sorts by confidence descending', () => {
    const { items } = getAiResults(db, { sort: 'confidence_desc' });
    // r1 has highest avg confidence
    expect(items[0].documentId).toBe('doc-1');
    expect(items[1].documentId).toBe('doc-2');
  });
});

describe('getAiResults - changedOnly filter', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('returns results where suggestions differ from current (null current counts as different)', () => {
    // r1 has suggestedCorrespondent='Amazon' but currentCorrespondent=null -> IS a change
    // r2 has suggestedCorrespondent='Tesco' but currentCorrespondent=null -> IS a change
    // r3 has suggestedCorrespondent=null and currentCorrespondent=null -> NOT a change (but tags also null=null)
    const { items } = getAiResults(db, { changedOnly: true });
    // r1 and r2 should be included (suggested != current), r3 has all nulls so no diff
    const ids = items.map((i) => i.documentId);
    expect(ids).toContain('doc-1');
    expect(ids).toContain('doc-2');
    expect(ids).not.toContain('doc-3');
  });

  it('excludes results where all suggestions match current values', () => {
    // Set current values to match suggested for doc-1
    db.update(aiProcessingResult)
      .set({
        currentCorrespondent: 'Amazon',
        currentDocumentType: 'Invoice',
        currentTagsJson: '["finance","shopping"]',
      })
      .where(eq(aiProcessingResult.documentId, 'doc-1'))
      .run();

    const { items } = getAiResults(db, { changedOnly: true });
    const ids = items.map((i) => i.documentId);
    expect(ids).not.toContain('doc-1');
    expect(ids).toContain('doc-2');
  });
});

describe('getAiResults - filters', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('filters by failed status', () => {
    const { items, total } = getAiResults(db, { failed: true });
    expect(total).toBe(1);
    expect(items[0].appliedStatus).toBe('failed');
  });

  it('filters by provider', () => {
    const { items, total } = getAiResults(db, { provider: 'anthropic' });
    expect(total).toBe(1);
    expect(items[0].provider).toBe('anthropic');
  });

  it('filters by model', () => {
    const { items, total } = getAiResults(db, { model: 'claude-sonnet-4-6' });
    expect(total).toBe(1);
    expect(items[0].model).toBe('claude-sonnet-4-6');
  });

  it('filters by minConfidence', () => {
    // r1 avg: (0.9+0.95+0.8)/3 = 0.883, r2 avg: (0.85+0.9+0.7)/3 = 0.817
    // r3 has null confidence and should be excluded
    const { items } = getAiResults(db, { minConfidence: 0.85 });
    expect(items).toHaveLength(1);
    expect(items[0].documentId).toBe('doc-1');
  });

  it('filters by maxConfidence', () => {
    const { items } = getAiResults(db, { maxConfidence: 0.85 });
    expect(items).toHaveLength(1);
    expect(items[0].documentId).toBe('doc-2');
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
    expect(stats.unprocessed).toBe(0);
    expect(stats.pendingReview).toBe(1);
    expect(stats.applied).toBe(1);
    expect(stats.rejected).toBe(0);
    expect(stats.failed).toBe(1);
  });

  it('counts failed results', () => {
    const stats = getAiStats(db);
    expect(stats.failed).toBe(1); // doc-3 has appliedStatus 'failed'
  });

  it('sums prompt and completion tokens', () => {
    const stats = getAiStats(db);
    expect(stats.totalPromptTokens).toBe(240); // 100 + 80 + 60
    expect(stats.totalCompletionTokens).toBe(90); // 50 + 40 + 0
  });

  it('counts unprocessed documents without AI results', async () => {
    // Add a document without an AI result
    db.insert(document)
      .values({
        id: 'doc-4',
        paperlessId: 4,
        title: 'Letter D',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const stats = getAiStats(db);
    expect(stats.totalProcessed).toBe(3);
    expect(stats.unprocessed).toBe(1);
  });

  it('returns all zeros for empty database', async () => {
    const handle = createDatabaseWithHandle(':memory:');
    const emptyDb = handle.db;
    await migrateDatabase(handle.sqlite);

    const stats = getAiStats(emptyDb);
    expect(stats.totalProcessed).toBe(0);
    expect(stats.unprocessed).toBe(0);
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

  it('sets status to "applied" when all 4 fields are provided', () => {
    markAiResultApplied(db, resultIds[0], ['title', 'correspondent', 'documentType', 'tags']);
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

describe('markAiResultFailed', () => {
  let db: AppDatabase;
  let resultIds: string[];

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultIds = seedDocumentsAndResults(db);
  });

  it('sets status to "failed" with error message and failure type', () => {
    markAiResultFailed(db, resultIds[0], 'No suggestions to apply', 'no_suggestions');
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('failed');
    expect(result!.errorMessage).toBe('No suggestions to apply');
    expect(result!.failureType).toBe('no_suggestions');
    expect(result!.appliedAt).toBeTruthy();
  });

  it('sets failureType to null when not provided', () => {
    markAiResultFailed(db, resultIds[0], 'Paperless API error');
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('failed');
    expect(result!.errorMessage).toBe('Paperless API error');
    expect(result!.failureType).toBeNull();
    expect(result!.appliedAt).toBeTruthy();
  });

  it('is counted in failed stats', () => {
    markAiResultFailed(db, resultIds[0], 'No suggestions to apply', 'no_suggestions');
    const stats = getAiStats(db);
    expect(stats.failed).toBeGreaterThanOrEqual(1);
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
    batchMarkApplied(
      db,
      [resultIds[0], resultIds[2]],
      ['title', 'correspondent', 'documentType', 'tags'],
    );
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
