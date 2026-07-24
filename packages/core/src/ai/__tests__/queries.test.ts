import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  getAiInboxResult,
  getAiStats,
  clearAllAiResults,
  markAiResultApplied,
  markAiResultRejected,
  markAiResultFailed,
  batchMarkApplied,
  batchMarkRejected,
  listAiReviewInbox,
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
      provider: 'openai',
      model: 'gpt-5.4-mini',
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

describe('listAiReviewInbox', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('uses stable confidence, timestamp, and id cursors without repeating tied results', () => {
    for (let index = 4; index <= 9; index += 1) {
      db.insert(document)
        .values({
          id: `doc-${index}`,
          paperlessId: index,
          title: `Tied invoice ${index}`,
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        })
        .run();
      db.insert(aiProcessingResult)
        .values({
          id: `result-${index}`,
          documentId: `doc-${index}`,
          paperlessId: index,
          provider: 'openai',
          model: 'gpt-5.4-mini',
          confidenceJson:
            index === 9 ? null : '{"correspondent":0.8,"documentType":0.8,"tags":0.8}',
          appliedStatus: 'pending_review',
          createdAt: '2024-02-01T00:00:00.000Z',
        })
        .run();
    }

    const first = listAiReviewInbox(db, { queue: 'review', limit: 3 });
    const second = listAiReviewInbox(db, {
      queue: 'review',
      limit: 3,
      cursor: first.nextCursor ?? undefined,
    });
    const third = listAiReviewInbox(db, {
      queue: 'review',
      limit: 3,
      cursor: second.nextCursor ?? undefined,
    });

    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      expect.any(String),
      'result-8',
      'result-7',
      'result-6',
      'result-5',
      'result-4',
      'result-9',
    ]);
    expect(first.previousCursor).toBeNull();
    expect(second.previousCursor).not.toBeNull();
  });

  it('separates extraction failures from review conflicts and returns safe grouped categories', () => {
    const seeded = getAiResults(db, { failed: true }).items[0];
    db.update(aiProcessingResult)
      .set({ failureType: 'timeout', errorMessage: 'secret upstream exception details' })
      .where(eq(aiProcessingResult.id, seeded.id))
      .run();

    db.insert(document)
      .values({
        id: 'doc-conflict',
        paperlessId: 100,
        title: 'Concurrent edit',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'result-conflict',
        documentId: 'doc-conflict',
        paperlessId: 100,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        appliedStatus: 'failed',
        failureType: 'review_conflict',
        errorMessage: 'private live value',
        createdAt: '2024-02-01T00:00:00Z',
      })
      .run();

    const failures = listAiReviewInbox(db, { queue: 'failures', limit: 20 });
    expect(failures.items.map((item) => item.id)).toEqual([seeded.id]);
    expect(failures.failureGroups).toEqual([
      { category: 'temporary', count: 1, label: 'Temporary service issue' },
    ]);
    expect(failures.items[0].safeFailure).toEqual({
      category: 'temporary',
      label: 'Temporary service issue',
    });
    expect(JSON.stringify(failures)).not.toContain('secret upstream');
    expect(JSON.stringify(failures)).not.toContain('private live value');

    const review = listAiReviewInbox(db, { queue: 'review', limit: 20 });
    expect(review.items.map((item) => item.id)).toContain('result-conflict');
    expect(review.items.find((item) => item.id === 'result-conflict')?.errorMessage).toBeNull();
  });

  it('shares active filters with failure groups and supports category and document targeting', () => {
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'failed', failureType: 'authentication' })
      .where(eq(aiProcessingResult.documentId, 'doc-1'))
      .run();
    db.update(aiProcessingResult)
      .set({ failureType: 'timeout' })
      .where(eq(aiProcessingResult.documentId, 'doc-3'))
      .run();
    db.insert(document)
      .values({
        id: 'doc-4',
        paperlessId: 4,
        title: 'Invoice with temporary failure',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'result-4',
        documentId: 'doc-4',
        paperlessId: 4,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        appliedStatus: 'failed',
        failureType: 'timeout',
        createdAt: '2024-01-04T00:00:00Z',
      })
      .run();

    const filtered = listAiReviewInbox(db, {
      queue: 'failures',
      limit: 20,
      search: 'Invoice',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      failureCategory: 'configuration',
    });
    expect(filtered.items.map((item) => item.documentId)).toEqual(['doc-1']);
    expect(filtered.failureGroups).toEqual([
      { category: 'configuration', count: 1, label: 'AI configuration needs attention' },
    ]);

    const documentOnly = listAiReviewInbox(db, {
      queue: 'failures',
      limit: 20,
      documentId: 'doc-3',
    });
    expect(documentOnly.items.map((item) => item.documentId)).toEqual(['doc-3']);
    expect(documentOnly.failureGroups).toEqual([
      { category: 'temporary', count: 1, label: 'Temporary service issue' },
    ]);
  });

  it('routes skipped, rejected, and review-conflict results to their advertised queues', () => {
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'skipped', failureType: 'no_content' })
      .where(eq(aiProcessingResult.documentId, 'doc-3'))
      .run();
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'rejected' })
      .where(eq(aiProcessingResult.documentId, 'doc-2'))
      .run();
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'failed', failureType: 'review_conflict' })
      .where(eq(aiProcessingResult.documentId, 'doc-1'))
      .run();

    expect(
      listAiReviewInbox(db, { queue: 'failures', documentId: 'doc-3' }).items.map(
        (item) => item.documentId,
      ),
    ).toEqual(['doc-3']);
    expect(
      listAiReviewInbox(db, { queue: 'history', documentId: 'doc-2' }).items.map(
        (item) => item.documentId,
      ),
    ).toEqual(['doc-2']);
    expect(
      listAiReviewInbox(db, { queue: 'review', documentId: 'doc-1' }).items.map(
        (item) => item.documentId,
      ),
    ).toEqual(['doc-1']);
  });

  it('rejects a cursor from another queue or malformed cursor', () => {
    const review = listAiReviewInbox(db, { queue: 'review', limit: 1 });
    expect(() =>
      listAiReviewInbox(db, {
        queue: 'failures',
        limit: 1,
        cursor: review.nextCursor ?? 'malformed',
      }),
    ).toThrow('Invalid AI inbox cursor');
    expect(() =>
      listAiReviewInbox(db, { queue: 'review', limit: 1, cursor: 'not-a-cursor' }),
    ).toThrow('Invalid AI inbox cursor');
    expect(() =>
      listAiReviewInbox(db, {
        queue: 'review',
        limit: 1,
        search: 'different-filter',
        cursor: review.nextCursor ?? 'malformed',
      }),
    ).toThrow('Invalid AI inbox cursor');
    const tampered = `${review.nextCursor?.slice(0, -1)}x`;
    expect(() => listAiReviewInbox(db, { queue: 'review', limit: 1, cursor: tampered })).toThrow(
      'Invalid AI inbox cursor',
    );
  });

  it('encrypts cursor contents and can decode them after reopening the database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-inbox-cursor-'));
    const databasePath = join(directory, 'inbox.db');
    try {
      const firstHandle = createDatabaseWithHandle(databasePath);
      await migrateDatabase(firstHandle.sqlite);
      seedDocumentsAndResults(firstHandle.db);
      firstHandle.db
        .insert(document)
        .values({
          id: 'private-document-id',
          paperlessId: 4,
          title: 'Invoice private search match',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        })
        .run();
      firstHandle.db
        .insert(aiProcessingResult)
        .values({
          id: 'private-result-id',
          documentId: 'private-document-id',
          paperlessId: 4,
          provider: 'openai',
          model: 'gpt-5.4-mini',
          appliedStatus: 'pending_review',
          createdAt: '2024-01-04T00:00:00Z',
        })
        .run();
      const first = listAiReviewInbox(firstHandle.db, {
        queue: 'review',
        limit: 1,
        search: 'Invoice',
      });
      const cursor = first.nextCursor!;
      expect(cursor).toBeTruthy();
      for (const segment of cursor.split('.')) {
        const decoded = Buffer.from(segment, 'base64url').toString('utf8');
        expect(decoded).not.toContain('doc-1');
        expect(decoded).not.toContain('private-document-id');
        expect(decoded).not.toContain('Invoice');
        expect(decoded).not.toContain(first.items[0].id);
      }
      firstHandle.sqlite.close();

      const reopened = createDatabaseWithHandle(databasePath);
      const next = listAiReviewInbox(reopened.db, {
        queue: 'review',
        limit: 1,
        search: 'Invoice',
        cursor,
      });
      expect(next.items).toHaveLength(1);
      reopened.sqlite.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('paginates apply audit history when applied timestamps are null or tied', () => {
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'partial', appliedAt: null })
      .where(eq(aiProcessingResult.documentId, 'doc-1'))
      .run();

    const first = listAiReviewInbox(db, { queue: 'history', limit: 1 });
    const second = listAiReviewInbox(db, {
      queue: 'history',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
  });

  it.each(['review', 'failures', 'history'] as const)(
    'returns exact first and last boundaries when paging %s backwards',
    (queue) => {
      if (queue === 'review') {
        db.update(aiProcessingResult)
          .set({ appliedStatus: 'pending_review' })
          .where(eq(aiProcessingResult.documentId, 'doc-2'))
          .run();
      } else if (queue === 'failures') {
        db.update(aiProcessingResult)
          .set({ appliedStatus: 'failed', failureType: 'timeout' })
          .where(eq(aiProcessingResult.documentId, 'doc-1'))
          .run();
      } else if (queue === 'history') {
        db.update(aiProcessingResult)
          .set({ appliedStatus: 'partial', appliedAt: null })
          .where(eq(aiProcessingResult.documentId, 'doc-1'))
          .run();
      }
      const first = listAiReviewInbox(db, { queue, limit: 1 });
      const second = listAiReviewInbox(db, {
        queue,
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });
      expect(first.previousCursor).toBeNull();
      expect(second.previousCursor).not.toBeNull();
      const back = listAiReviewInbox(db, {
        queue,
        limit: 1,
        cursor: second.previousCursor ?? undefined,
      });
      expect(back.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
      expect(back.previousCursor).toBeNull();
      expect(back.nextCursor).not.toBeNull();
    },
  );

  it('keeps two cursor pages correct on a 50k-result inbox', async () => {
    const handle = createDatabaseWithHandle(':memory:');
    await migrateDatabase(handle.sqlite);
    handle.sqlite.exec(`
      WITH RECURSIVE numbers(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM numbers WHERE n < 50000
      )
      INSERT INTO document (id, paperless_id, title, processing_status, synced_at)
      SELECT 'perf-doc-' || n, n, 'Performance document ' || n, 'completed',
             '2024-01-01T00:00:00.000Z'
      FROM numbers;

      WITH RECURSIVE numbers(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM numbers WHERE n < 50000
      )
      INSERT INTO ai_processing_result (
        id, document_id, paperless_id, provider, model, confidence_json,
        applied_status, created_at
      )
      SELECT 'perf-result-' || n, 'perf-doc-' || n, n, 'openai', 'perf-model',
             json_object(
               'title', (n % 100) / 100.0,
               'correspondent', (n % 100) / 100.0,
               'documentType', (n % 100) / 100.0,
               'tags', (n % 100) / 100.0
             ),
             'pending_review',
             strftime('%Y-%m-%dT%H:%M:%fZ', '2024-01-01', '+' || n || ' seconds')
      FROM numbers;
    `);

    const startedAt = performance.now();
    const first = listAiReviewInbox(handle.db, { queue: 'review', limit: 100 });
    const second = listAiReviewInbox(handle.db, {
      queue: 'review',
      limit: 100,
      cursor: first.nextCursor ?? undefined,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(first.total).toBe(50_000);
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(100);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(200);
    expect(elapsedMs).toBeLessThan(5_000);
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

  it('returns a bounded safe inbox detail without raw model or exception payloads', () => {
    const hugeValue = 'private-value-'.repeat(10_000);
    const hugeCustomFields = Array.from({ length: 200 }, (_, field) => ({
      field,
      fieldId: field,
      fieldName: `field-${field}-${hugeValue}`,
      value: {
        nested: [hugeValue, { deeper: hugeValue }],
        ...(field === 0 ? { ['private-key-'.repeat(10_000)]: hugeValue } : {}),
      },
      confidence: 0.9,
    }));
    db.update(aiProcessingResult)
      .set({
        evidence: 'e'.repeat(900),
        rawResponseJson: '{"private":"raw-model-output"}',
        errorMessage: 'private upstream stack',
        failureType: 'timeout',
        suggestedTitle: hugeValue,
        currentTitle: hugeValue,
        suggestedTagsJson: JSON.stringify(Array(200).fill(hugeValue)),
        currentTagsJson: JSON.stringify(Array(200).fill(hugeValue)),
        suggestedCustomFieldsJson: JSON.stringify(hugeCustomFields),
        currentCustomFieldsJson: JSON.stringify(hugeCustomFields),
        preApplyCustomFieldsJson: JSON.stringify(hugeCustomFields),
        appliedCustomFieldsJson: JSON.stringify(hugeCustomFields),
        preApplyTagNamesJson: JSON.stringify(Array(200).fill(hugeValue)),
      })
      .where(eq(aiProcessingResult.id, resultIds[0]))
      .run();

    const result = getAiInboxResult(db, resultIds[0]);
    expect(result?.evidence).toHaveLength(500);
    expect(result?.errorMessage).toBeNull();
    expect(result).not.toHaveProperty('rawResponseJson');
    expect(result?.truncation.truncated).toBe(true);
    expect(result?.truncation.paths).toContain('suggestedTitle');
    expect(JSON.stringify(result).length).toBeLessThan(65_536);
    expect(JSON.stringify(result)).not.toContain('private upstream');
    expect(JSON.stringify(result)).not.toContain('raw-model-output');
    // The inbox projection may truncate untrusted display content, but it must
    // never spend that budget on the controls used to decide what can be
    // reviewed or applied.
    expect(result).toMatchObject({
      id: resultIds[0],
      documentId: 'doc-1',
      appliedStatus: 'pending_review',
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(result?.safeFailure).toEqual(null);
    expect(result?.confidence).toEqual(getAiResult(db, resultIds[0])?.confidence);
    expect(result?.suggestedCustomFields[0]).toMatchObject({
      fieldId: 0,
      confidence: 0.9,
    });

    const legacy = getAiResult(db, resultIds[0]);
    expect(legacy?.suggestedTitle).toBe(hugeValue);
    expect(legacy?.suggestedCustomFields).toHaveLength(200);
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
    const { items, total } = getAiResults(db, { provider: 'openai' });
    expect(total).toBe(3);
    expect(items.every((i) => i.provider === 'openai')).toBe(true);
  });

  it('filters by model', () => {
    const { items, total } = getAiResults(db, { model: 'gpt-5.4-mini' });
    expect(total).toBe(3);
    expect(items.every((i) => i.model === 'gpt-5.4-mini')).toBe(true);
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

describe('clearAllAiResults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    seedDocumentsAndResults(db);
  });

  it('deletes all AI results and returns the count', () => {
    const deleted = clearAllAiResults(db);
    expect(deleted).toBe(3);
    const stats = getAiStats(db);
    expect(stats.totalProcessed).toBe(0);
  });

  it('returns 0 when no results exist', async () => {
    const handle = createDatabaseWithHandle(':memory:');
    const emptyDb = handle.db;
    await migrateDatabase(handle.sqlite);
    const deleted = clearAllAiResults(emptyDb);
    expect(deleted).toBe(0);
  });

  it('makes documents eligible for reprocessing', () => {
    clearAllAiResults(db);
    const stats = getAiStats(db);
    expect(stats.unprocessed).toBe(3);
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

  it('sets status to "applied" when custom fields are included with all standard fields', () => {
    markAiResultApplied(db, resultIds[0], [
      'title',
      'correspondent',
      'documentType',
      'tags',
      'customFields',
    ]);
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('applied');
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

  it('sets applied status when custom fields are included with all standard fields', () => {
    batchMarkApplied(
      db,
      [resultIds[0]],
      ['title', 'correspondent', 'documentType', 'tags', 'customFields'],
    );
    const result = getAiResult(db, resultIds[0]);
    expect(result!.appliedStatus).toBe('applied');
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
