import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  listDocumentLibrary as listNormalizedDocumentLibrary,
  documentLibraryAddedDateKeySql,
  getDocuments,
  getDocument,
  getDocumentStats,
  deleteDocumentLocally,
} from '../documents.js';
import {
  decodeDocumentLibraryCursor,
  documentLibraryQuerySchema,
  encodeDocumentLibraryCursor,
} from '../types.js';
import type { DocumentLibraryQueryInput } from '../types.js';
import { document, documentContent, documentSignature } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';

function insertTestDocuments(db: AppDatabase) {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice January',
        correspondent: 'Alice',
        documentType: 'Invoice',
        tagsJson: '["finance","monthly"]',
        createdDate: '2024-01-15',
        addedDate: '2024-01-16',
        processingStatus: 'completed',
        syncedAt: '2024-01-16T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Receipt February',
        correspondent: 'Bob',
        documentType: 'Receipt',
        tagsJson: '["finance"]',
        createdDate: '2024-02-10',
        addedDate: '2024-02-11',
        processingStatus: 'completed',
        syncedAt: '2024-02-11T00:00:00Z',
      },
      {
        id: 'doc-3',
        paperlessId: 3,
        title: 'Contract Draft',
        correspondent: 'Alice',
        documentType: 'Contract',
        tagsJson: '["legal"]',
        createdDate: '2024-03-01',
        addedDate: '2024-03-02',
        processingStatus: 'pending',
        syncedAt: '2024-03-02T00:00:00Z',
      },
    ])
    .run();
}

function listDocumentLibrary(db: AppDatabase, input: DocumentLibraryQueryInput) {
  return listNormalizedDocumentLibrary(db, documentLibraryQuerySchema.parse(input));
}

describe('getDocuments', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns empty result for empty database', () => {
    const result = getDocuments(db, {}, { limit: 50, offset: 0 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns documents with parsed tags', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, {}, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);

    const doc1 = result.items.find((d) => d.id === 'doc-1');
    expect(doc1!.tags).toEqual(['finance', 'monthly']);
  });

  it('filters by correspondent', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, { correspondent: 'Alice' }, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.items.every((d) => d.correspondent === 'Alice')).toBe(true);
  });

  it('filters by documentType', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, { documentType: 'Invoice' }, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].documentType).toBe('Invoice');
  });

  it('filters by tag (substring match in tagsJson)', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, { tag: 'finance' }, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(2);
  });

  it('filters by processingStatus', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, { processingStatus: 'pending' }, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('doc-3');
  });

  it('searches by title substring', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, { search: 'Invoice' }, { limit: 50, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Invoice January');
  });

  it('paginates results correctly', () => {
    insertTestDocuments(db);
    const page1 = getDocuments(db, {}, { limit: 2, offset: 0 });
    const page2 = getDocuments(db, {}, { limit: 2, offset: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.limit).toBe(2);
    expect(page1.offset).toBe(0);
    expect(page2.offset).toBe(2);
  });

  it('returns correct total count regardless of pagination', () => {
    insertTestDocuments(db);
    const result = getDocuments(db, {}, { limit: 1, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
  });
});

describe('listDocumentLibrary', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestDocuments(db);

    db.insert(documentContent)
      .values([
        {
          id: 'content-1',
          documentId: 'doc-1',
          fullText: 'Quarterly electricity usage for Camden',
          wordCount: 5,
        },
        { id: 'content-2', documentId: 'doc-2', fullText: '', wordCount: 0 },
      ])
      .run();
    db.update(document)
      .set({
        customFieldsJson: JSON.stringify([
          { field: 7, value: 'ACC-123' },
          { field: 9, value: 42 },
        ]),
        lastChangedBySyncGenerationId: 'generation-current',
      })
      .where(eq(document.id, 'doc-1'))
      .run();
    db.insert(duplicateGroup)
      .values({
        id: 'library-group',
        confidenceScore: 0.9,
        algorithmVersion: 'v1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(duplicateMember)
      .values({ id: 'library-member', groupId: 'library-group', documentId: 'doc-1' })
      .run();
    db.insert(aiProcessingResult)
      .values([
        {
          id: 'ai-library-1',
          documentId: 'doc-1',
          paperlessId: 1,
          provider: 'test',
          model: 'test',
          appliedStatus: 'pending_review',
          syncGenerationId: 'generation-current',
          createdAt: '2024-03-01T00:00:00Z',
        },
        {
          id: 'ai-library-2',
          documentId: 'doc-2',
          paperlessId: 2,
          provider: 'test',
          model: 'test',
          appliedStatus: 'failed',
          syncGenerationId: 'generation-old',
          createdAt: '2024-03-01T00:00:00Z',
        },
      ])
      .run();
  });

  it('searches bounded text across metadata and OCR without returning OCR text', () => {
    const result = listDocumentLibrary(db, { text: 'electricity', limit: 25 });

    expect(result.items.map((item) => item.id)).toEqual(['doc-1']);
    expect(result.items[0]).not.toHaveProperty('fullText');
    expect(JSON.stringify(result)).not.toContain('Quarterly electricity usage');
  });

  it('filters documents with missing or empty OCR', () => {
    expect(
      listDocumentLibrary(db, { missingOcr: true, limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-3', 'doc-2']);
    expect(
      listDocumentLibrary(db, { missingOcr: false, limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-1']);
  });

  it('filters exact metadata, tags, and canonical string custom-field values', () => {
    expect(
      listDocumentLibrary(db, {
        correspondent: 'Alice',
        documentType: 'Invoice',
        tag: 'finance',
        customFieldId: 7,
        customFieldValue: '"ACC-123"',
        limit: 25,
      }).items.map((item) => item.id),
    ).toEqual(['doc-1']);
    expect(listDocumentLibrary(db, { tag: 'fin', limit: 25 }).items).toEqual([]);
    expect(
      listDocumentLibrary(db, {
        customFieldId: 9,
        customFieldValue: '42',
        limit: 25,
      }).items.map((item) => item.id),
    ).toEqual(['doc-1']);
  });

  it.each([
    ['string', '"ACC-123"', 7],
    ['number', '42', 9],
    ['boolean', 'true', 10],
    ['false boolean', 'false', 13],
    ['number array', '[1,2.5,3]', 11],
    ['null', 'null', 12],
  ])(
    'matches type-correct %s custom-field JSON without duplicate rows',
    (_name, value, fieldId) => {
      db.update(document)
        .set({
          customFieldsJson: JSON.stringify([
            { field: 7, value: 'ACC-123' },
            { field: 9, value: 42 },
            { field: 10, value: true },
            { field: 13, value: false },
            { field: 11, value: [1, 2.5, 3] },
            { field: 12, value: null },
            { field: 7, value: 'ACC-123' },
          ]),
        })
        .where(eq(document.id, 'doc-1'))
        .run();

      const result = listDocumentLibrary(db, {
        customFieldId: fieldId,
        customFieldValue: value,
        limit: 25,
      });
      expect(result.items.map((item) => item.id)).toEqual(['doc-1']);
    },
  );

  it('does not conflate custom-field JSON types', () => {
    expect(
      listDocumentLibrary(db, {
        customFieldId: 9,
        customFieldValue: '"42"',
        limit: 25,
      }).items,
    ).toEqual([]);
    expect(
      listDocumentLibrary(db, {
        customFieldId: 7,
        customFieldValue: '42',
        limit: 25,
      }).items,
    ).toEqual([]);
  });

  it('filters duplicate involvement and AI status', () => {
    expect(
      listDocumentLibrary(db, { duplicate: 'involved', limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-1']);
    expect(
      listDocumentLibrary(db, { duplicate: 'not-involved', limit: 25 }).items.map(
        (item) => item.id,
      ),
    ).toEqual(['doc-3', 'doc-2']);
    expect(
      listDocumentLibrary(db, { aiStatus: 'unprocessed', limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-3']);
    expect(
      listDocumentLibrary(db, { aiStatus: 'failed', limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-2']);
  });

  it('projects the AI failure category without exposing raw failure details', () => {
    db.update(aiProcessingResult)
      .set({
        failureType: 'review_conflict',
        errorMessage: 'private live Paperless value and upstream details',
      })
      .where(eq(aiProcessingResult.documentId, 'doc-2'))
      .run();

    const page = listDocumentLibrary(db, { aiStatus: 'failed', limit: 25 });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: 'doc-2',
        aiStatus: 'failed',
        aiFailureType: 'review_conflict',
      }),
    ]);
    expect(JSON.stringify(page)).not.toContain('private live Paperless value');
    expect(page.items[0]).not.toHaveProperty('errorMessage');
  });

  it('projects one actionable duplicate target deterministically while counting every group', () => {
    db.insert(duplicateGroup)
      .values([
        {
          id: 'ignored-newer',
          confidenceScore: 0.8,
          algorithmVersion: 'v1',
          status: 'ignored',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'false-positive-newer',
          confidenceScore: 0.7,
          algorithmVersion: 'v1',
          status: 'false_positive',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])
      .run();
    db.insert(duplicateMember)
      .values([
        {
          id: 'ignored-newer-member',
          groupId: 'ignored-newer',
          documentId: 'doc-1',
        },
        {
          id: 'false-positive-newer-member',
          groupId: 'false-positive-newer',
          documentId: 'doc-1',
        },
      ])
      .run();

    expect(listDocumentLibrary(db, { limit: 25 }).items.at(-1)).toMatchObject({
      id: 'doc-1',
      duplicateGroupCount: 3,
      duplicateGroupId: 'library-group',
      duplicateGroupStatus: 'pending',
    });

    db.update(duplicateGroup)
      .set({ status: 'deleted' })
      .where(eq(duplicateGroup.id, 'library-group'))
      .run();

    expect(listDocumentLibrary(db, { limit: 25 }).items.at(-1)).toMatchObject({
      id: 'doc-1',
      duplicateGroupCount: 3,
      duplicateGroupId: 'ignored-newer',
      duplicateGroupStatus: 'ignored',
    });
  });

  it('filters exact missing-classification populations', () => {
    db.update(document)
      .set({
        correspondent: ' ',
        documentType: null,
        tagsJson: '{malformed',
      })
      .where(eq(document.id, 'doc-3'))
      .run();

    expect(
      listDocumentLibrary(db, { missingCorrespondent: true, limit: 25 }).items.map(
        (item) => item.id,
      ),
    ).toEqual(['doc-3']);
    expect(
      listDocumentLibrary(db, { missingDocumentType: true, limit: 25 }).items.map(
        (item) => item.id,
      ),
    ).toEqual(['doc-3']);
    expect(
      listDocumentLibrary(db, { missingTags: true, limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-3']);
  });

  it('filters bounded exact metadata sets as a distinct document union', () => {
    db.update(document)
      .set({ tagsJson: '["finance","Finance","finance"]' })
      .where(eq(document.id, 'doc-1'))
      .run();

    expect(
      listDocumentLibrary(db, {
        correspondentSet: '["Alice","Bob"]',
        limit: 25,
      }).items.map((item) => item.id),
    ).toEqual(['doc-3', 'doc-2', 'doc-1']);
    expect(
      listDocumentLibrary(db, {
        documentTypeSet: '["Contract","Invoice"]',
        limit: 25,
      }).items.map((item) => item.id),
    ).toEqual(['doc-3', 'doc-1']);
    const tagPage = listDocumentLibrary(db, {
      tagSet: '["Finance","finance"]',
      limit: 25,
    });
    expect(tagPage.items.map((item) => item.id)).toEqual(['doc-2', 'doc-1']);
    expect(tagPage.counts.total).toBe(2);
  });

  it('filters AI freshness against the document sync generation', () => {
    expect(
      listDocumentLibrary(db, { freshness: 'fresh', limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-1']);
    expect(
      listDocumentLibrary(db, { freshness: 'stale', limit: 25 }).items.map((item) => item.id),
    ).toEqual(['doc-2']);
  });

  it('uses a stable null-safe added-date and paperless-id cursor', () => {
    db.update(document).set({ addedDate: '2024-03-02' }).where(eq(document.id, 'doc-2')).run();
    db.update(document).set({ addedDate: null }).where(eq(document.id, 'doc-3')).run();
    db.insert(document)
      .values({
        id: 'doc-4',
        paperlessId: 4,
        title: 'Same date',
        addedDate: '2024-03-02',
        syncedAt: '2024-03-02T00:00:00Z',
      })
      .run();

    const first = listDocumentLibrary(db, { limit: 25 });
    expect(first.items.map((item) => item.paperlessId)).toEqual([4, 2, 1, 3]);

    const page1 = listDocumentLibrary(db, { limit: 25 });
    const cursorAfterFirst = encodeDocumentLibraryCursor({
      addedDate: page1.items[0].addedDate,
      paperlessId: page1.items[0].paperlessId,
    });
    const rest = listDocumentLibrary(db, { cursor: cursorAfterFirst, limit: 25 });
    expect(rest.items.map((item) => item.paperlessId)).toEqual([2, 1, 3]);
  });

  it('normalizes null, empty, and malformed added dates to one stable cursor sentinel', () => {
    db.update(document).set({ addedDate: null }).where(eq(document.id, 'doc-1')).run();
    db.update(document).set({ addedDate: '' }).where(eq(document.id, 'doc-2')).run();
    db.update(document).set({ addedDate: 'not-a-date' }).where(eq(document.id, 'doc-3')).run();
    db.insert(document)
      .values(
        Array.from({ length: 27 }, (_, index) => {
          const paperlessId = index + 4;
          return {
            id: `invalid-date-${paperlessId}`,
            paperlessId,
            title: `Invalid date ${paperlessId}`,
            addedDate:
              paperlessId % 4 === 0
                ? null
                : paperlessId % 4 === 1
                  ? ''
                  : paperlessId % 4 === 2
                    ? 'definitely-invalid'
                    : 'now',
            syncedAt: '2024-01-01T00:00:00Z',
          };
        }),
      )
      .run();

    const first = listDocumentLibrary(db, { limit: 25 });
    const second = listDocumentLibrary(db, { cursor: first.nextCursor!, limit: 25 });
    const combined = [...first.items, ...second.items];

    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).toBeNull();
    expect(combined.map((item) => item.paperlessId)).toEqual(
      Array.from({ length: 30 }, (_, index) => 30 - index),
    );
    expect(combined.every((item) => item.addedDate === null)).toBe(true);
    expect(new Set(combined.map((item) => item.id)).size).toBe(30);
  });

  it('maps SQLite hour-24 dates to the sentinel when they land on a page boundary', () => {
    db.delete(aiProcessingResult).run();
    db.delete(duplicateMember).run();
    db.delete(duplicateGroup).run();
    db.delete(documentContent).run();
    db.delete(document).run();
    db.insert(document)
      .values([
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `valid-boundary-${index}`,
          paperlessId: 100 + index,
          title: `Valid boundary ${index}`,
          addedDate: '2025-01-01T00:00:00Z',
          syncedAt: '2025-01-01T00:00:00Z',
        })),
        {
          id: 'hour-24-boundary',
          paperlessId: 50,
          title: 'SQLite accepts but ISO cursor rejects',
          addedDate: '2024-01-01T24:00:00Z',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'sentinel-after-boundary',
          paperlessId: 1,
          title: 'Sentinel after boundary',
          addedDate: null,
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    const first = listDocumentLibrary(db, { limit: 25 });
    const second = listDocumentLibrary(db, { cursor: first.nextCursor!, limit: 25 });

    expect(first.items.at(-1)).toMatchObject({
      id: 'hour-24-boundary',
      addedDate: null,
    });
    expect(second.items.map((item) => item.id)).toEqual(['sentinel-after-boundary']);
  });

  it('keeps every projected date key inside the cursor codec domain', () => {
    db.delete(aiProcessingResult).run();
    db.delete(duplicateMember).run();
    db.delete(duplicateGroup).run();
    db.delete(documentContent).run();
    db.delete(document).run();
    const fixtures = [
      ['valid-date', '2024-02-29'],
      ['valid-zulu', '2024-01-01T23:59:59Z'],
      ['valid-fraction', '2024-01-01T23:59:59.123456Z'],
      ['valid-offset', '2024-01-01T23:59:59+01:30'],
      ['invalid-hour', '2024-01-01T24:00:00Z'],
      ['invalid-minute', '2024-01-01T23:60:00Z'],
      ['invalid-second', '2024-01-01T23:59:60Z'],
      ['invalid-month', '2024-13-01T00:00:00Z'],
      ['invalid-day', '2024-02-30T00:00:00Z'],
      ['invalid-offset-hour', '2024-01-01T12:00:00+24:00'],
      ['invalid-offset-minute', '2024-01-01T12:00:00+01:60'],
      ['invalid-offset-14-minute', '2024-01-01T12:00:00+14:01'],
      ['invalid-normalized-year', '0000-01-01T00:00:00+14:00'],
      ['invalid-no-zone', '2024-01-01T12:00:00'],
      ['invalid-separator', '2024-01-01 12:00:00Z'],
    ] as const;
    db.insert(document)
      .values(
        fixtures.map(([id, addedDate], index) => ({
          id,
          paperlessId: index + 1,
          title: id,
          addedDate,
          syncedAt: '2024-01-01T00:00:00Z',
        })),
      )
      .run();

    const page = listDocumentLibrary(db, { limit: 100 });
    for (const item of page.items) {
      if (item.id.startsWith('invalid-')) {
        expect(item.addedDate, item.id).toBeNull();
      } else {
        expect(item.addedDate, item.id).not.toBeNull();
      }
      if (item.addedDate !== null) {
        expect(() =>
          encodeDocumentLibraryCursor({
            addedDate: item.addedDate,
            paperlessId: item.paperlessId,
          }),
        ).not.toThrow();
      }
    }
  });

  it('returns cursor-independent aggregate counts for the filtered set', () => {
    const first = listDocumentLibrary(db, { limit: 25 });
    const afterFirst = listDocumentLibrary(db, {
      cursor: encodeDocumentLibraryCursor({
        addedDate: first.items[0].addedDate,
        paperlessId: first.items[0].paperlessId,
      }),
      limit: 25,
    });

    expect(first.counts).toEqual({
      total: 3,
      missingOcr: 2,
      duplicateInvolved: 1,
      aiUnprocessed: 1,
      aiStale: 1,
    });
    expect(afterFirst.counts).toEqual(first.counts);
  });

  it('validates bounded limits and canonical cursors without offset', () => {
    expect(documentLibraryQuerySchema.parse({})).toEqual({
      duplicate: 'any',
      limit: 50,
    });
    for (const limit of [25, 50, 100]) {
      expect(documentLibraryQuerySchema.parse({ limit }).limit).toBe(limit);
    }
    for (const limit of [0, 24, 26, 101]) {
      expect(documentLibraryQuerySchema.safeParse({ limit }).success).toBe(false);
    }
    expect(documentLibraryQuerySchema.safeParse({ offset: 1 }).success).toBe(false);
    expect(documentLibraryQuerySchema.safeParse({ cursor: 'not-a-cursor' }).success).toBe(false);
    for (const value of ['"string"', '42', 'true', '[1,2.5]', 'null']) {
      expect(
        documentLibraryQuerySchema.safeParse({
          customFieldId: 7,
          customFieldValue: value,
        }).success,
      ).toBe(true);
    }
    for (const value of [
      'plain string',
      ' 42',
      '1e2',
      '[1, 2]',
      '["1"]',
      '{"value":1}',
      'undefined',
    ]) {
      expect(
        documentLibraryQuerySchema.safeParse({
          customFieldId: 7,
          customFieldValue: value,
        }).success,
      ).toBe(false);
    }
    expect(
      documentLibraryQuerySchema.parse({
        correspondentSet: '["Alice","Bob"]',
        documentTypeSet: '["Contract","Invoice"]',
        tagSet: '["Finance","finance"]',
      }),
    ).toMatchObject({
      correspondentSet: ['Alice', 'Bob'],
      documentTypeSet: ['Contract', 'Invoice'],
      tagSet: ['Finance', 'finance'],
    });
    for (const value of [
      '[]',
      '["Alice","Alice"]',
      '["Bob","Alice"]',
      '[" Alice"]',
      '[""]',
      '[1]',
      '["ok",null]',
      '["unterminated"',
      JSON.stringify(Array.from({ length: 11 }, (_, index) => `value-${index}`)),
      JSON.stringify(['x'.repeat(201)]),
    ]) {
      expect(documentLibraryQuerySchema.safeParse({ correspondentSet: value }).success, value).toBe(
        false,
      );
    }

    const cursor = encodeDocumentLibraryCursor({ addedDate: null, paperlessId: 3 });
    expect(decodeDocumentLibraryCursor(cursor)).toEqual({ addedDate: null, paperlessId: 3 });
    expect(decodeDocumentLibraryCursor(`${cursor}=`)).toBeNull();
    const invalidDateCursor = Buffer.from(
      JSON.stringify({ addedDate: 'not-a-date', paperlessId: 3 }),
      'utf8',
    ).toString('base64url');
    expect(decodeDocumentLibraryCursor(invalidDateCursor)).toBeNull();
  });

  it('walks three deep pages in a 50k library and records the baseline query plan', () => {
    db.delete(aiProcessingResult).run();
    db.delete(duplicateMember).run();
    db.delete(duplicateGroup).run();
    db.delete(documentContent).run();
    db.delete(document).run();

    const batchSize = 500;
    for (let start = 1; start <= 50_000; start += batchSize) {
      db.insert(document)
        .values(
          Array.from({ length: batchSize }, (_, index) => {
            const paperlessId = start + index;
            return {
              id: `scale-${paperlessId}`,
              paperlessId,
              title: `Document ${paperlessId}`,
              addedDate: `2024-${String((paperlessId % 12) + 1).padStart(2, '0')}-${String(
                (paperlessId % 28) + 1,
              ).padStart(2, '0')}`,
              syncedAt: '2024-01-01T00:00:00Z',
            };
          }),
        )
        .run();
    }

    const page1 = listDocumentLibrary(db, { limit: 100 });
    const page2 = listDocumentLibrary(db, { cursor: page1.nextCursor!, limit: 100 });
    const page3 = listDocumentLibrary(db, { cursor: page2.nextCursor!, limit: 100 });

    expect(
      new Set([...page1.items, ...page2.items, ...page3.items].map((item) => item.id)).size,
    ).toBe(300);
    expect(page1.counts.total).toBe(50_000);
    expect(page2.counts).toEqual(page1.counts);
    expect(page3.counts).toEqual(page1.counts);

    const plan = db.$client
      .prepare(
        `EXPLAIN QUERY PLAN SELECT paperless_id FROM document d ORDER BY ${documentLibraryAddedDateKeySql} DESC, d.paperless_id DESC LIMIT 101`,
      )
      .all() as Array<{ detail: string }>;
    const planText = plan.map(({ detail }) => detail).join('\n');
    expect(planText).toMatch(/SCAN (?:document|d)/);
    expect(planText).toMatch(/USING (?:COVERING )?INDEX document_library_added_date_paperless_idx/);
    expect(planText).not.toContain('USE TEMP B-TREE FOR ORDER BY');
  }, 30_000);
});

describe('getDocument', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns null for non-existent ID', () => {
    expect(getDocument(db, 'nonexistent')).toBeNull();
  });

  it('returns document with content when content exists', () => {
    insertTestDocuments(db);
    db.insert(documentContent)
      .values({
        id: 'content-1',
        documentId: 'doc-1',
        fullText: 'Full text of invoice',
        normalizedText: 'full text of invoice',
        wordCount: 5,
        contentHash: 'abc123',
      })
      .run();

    const result = getDocument(db, 'doc-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('doc-1');
    expect(result!.title).toBe('Invoice January');
    expect(result!.tags).toEqual(['finance', 'monthly']);
    expect(result!.content).not.toBeNull();
    expect(result!.content!.fullText).toBe('Full text of invoice');
    expect(result!.content!.wordCount).toBe(5);
    expect(result!.content!.contentHash).toBe('abc123');
  });

  it('returns document without content (content: null)', () => {
    insertTestDocuments(db);

    const result = getDocument(db, 'doc-1');

    expect(result).not.toBeNull();
    expect(result!.content).toBeNull();
  });

  it('returns groupMemberships when document is in duplicate groups', () => {
    insertTestDocuments(db);

    db.insert(duplicateGroup)
      .values({
        id: 'grp-1',
        confidenceScore: 0.92,
        algorithmVersion: 'v1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    db.insert(duplicateMember)
      .values([
        { id: 'mem-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true },
        { id: 'mem-2', groupId: 'grp-1', documentId: 'doc-2', isPrimary: false },
      ])
      .run();

    const result = getDocument(db, 'doc-1');

    expect(result).not.toBeNull();
    expect(result!.groupMemberships).toHaveLength(1);
    expect(result!.groupMemberships[0]).toEqual({
      groupId: 'grp-1',
      confidenceScore: 0.92,
      isPrimary: true,
      status: 'pending',
    });
  });

  it('returns empty groupMemberships when document has no groups', () => {
    insertTestDocuments(db);

    const result = getDocument(db, 'doc-1');

    expect(result).not.toBeNull();
    expect(result!.groupMemberships).toEqual([]);
  });
});

describe('getDocumentStats', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns sensible defaults for empty database', () => {
    const stats = getDocumentStats(db);

    expect(stats.totalDocuments).toBe(0);
    expect(stats.ocrCoverage).toEqual({ withContent: 0, withoutContent: 0, percentage: 0 });
    expect(stats.processingStatus).toEqual({ pending: 0, completed: 0 });
    expect(stats.correspondentDistribution).toEqual([]);
    expect(stats.documentTypeDistribution).toEqual([]);
    expect(stats.tagDistribution).toEqual([]);
    expect(stats.averageWordCount).toBe(0);
    expect(stats.documentsOverTime).toEqual([]);
    expect(stats.wordCountDistribution).toEqual([
      { bucket: '0 - 100', count: 0 },
      { bucket: '100 - 500', count: 0 },
      { bucket: '500 - 1K', count: 0 },
      { bucket: '1K - 5K', count: 0 },
      { bucket: '5K - 10K', count: 0 },
      { bucket: '10K+', count: 0 },
    ]);
    expect(stats.unclassified).toEqual({
      noCorrespondent: 0,
      noDocumentType: 0,
      noTags: 0,
    });
    expect(stats.duplicateInvolvement).toEqual({
      documentsInGroups: 0,
      percentage: 0,
    });
  });

  it('returns correct documentsOverTime grouped by month ascending', () => {
    insertTestDocuments(db);
    const stats = getDocumentStats(db);

    expect(stats.documentsOverTime).toEqual([
      { month: '2024-01', count: 1 },
      { month: '2024-02', count: 1 },
      { month: '2024-03', count: 1 },
    ]);
  });

  it('groups multiple documents in the same month', () => {
    db.insert(document)
      .values([
        {
          id: 'a1',
          paperlessId: 10,
          title: 'Doc A',
          addedDate: '2024-05-01',
          syncedAt: '2024-05-01T00:00:00Z',
        },
        {
          id: 'a2',
          paperlessId: 11,
          title: 'Doc B',
          addedDate: '2024-05-15',
          syncedAt: '2024-05-15T00:00:00Z',
        },
      ])
      .run();

    const stats = getDocumentStats(db);
    expect(stats.documentsOverTime).toEqual([{ month: '2024-05', count: 2 }]);
  });

  it('puts content in correct word count buckets', () => {
    db.insert(document)
      .values([
        { id: 'w1', paperlessId: 30, title: 'A', syncedAt: '2024-01-01T00:00:00Z' },
        { id: 'w2', paperlessId: 31, title: 'B', syncedAt: '2024-01-01T00:00:00Z' },
        { id: 'w3', paperlessId: 32, title: 'C', syncedAt: '2024-01-01T00:00:00Z' },
      ])
      .run();
    db.insert(documentContent)
      .values([
        { id: 'wc1', documentId: 'w1', wordCount: 50 },
        { id: 'wc2', documentId: 'w2', wordCount: 250 },
        { id: 'wc3', documentId: 'w3', wordCount: 7500 },
      ])
      .run();

    const stats = getDocumentStats(db);
    expect(stats.wordCountDistribution).toEqual([
      { bucket: '0 - 100', count: 1 },
      { bucket: '100 - 500', count: 1 },
      { bucket: '500 - 1K', count: 0 },
      { bucket: '1K - 5K', count: 0 },
      { bucket: '5K - 10K', count: 1 },
      { bucket: '10K+', count: 0 },
    ]);
  });

  it('counts unclassified documents correctly', () => {
    db.insert(document)
      .values([
        {
          id: 'u1',
          paperlessId: 40,
          title: 'No Correspondent',
          correspondent: null,
          documentType: 'Invoice',
          tagsJson: '["tag1"]',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'u2',
          paperlessId: 41,
          title: 'No Type',
          correspondent: 'Alice',
          documentType: null,
          tagsJson: '["tag1"]',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'u3',
          paperlessId: 42,
          title: 'No Tags',
          correspondent: 'Bob',
          documentType: 'Receipt',
          tagsJson: '[]',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'u4',
          paperlessId: 43,
          title: 'Null Tags',
          correspondent: 'Bob',
          documentType: 'Receipt',
          tagsJson: null,
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'u5',
          paperlessId: 44,
          title: 'Fully Classified',
          correspondent: 'Alice',
          documentType: 'Invoice',
          tagsJson: '["finance"]',
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    const stats = getDocumentStats(db);
    expect(stats.unclassified.noCorrespondent).toBe(1);
    expect(stats.unclassified.noDocumentType).toBe(1);
    expect(stats.unclassified.noTags).toBe(2);
  });

  it('calculates duplicate involvement correctly', () => {
    insertTestDocuments(db);

    db.insert(duplicateGroup)
      .values({
        id: 'grp-1',
        confidenceScore: 0.9,
        algorithmVersion: 'v1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    db.insert(duplicateMember)
      .values([
        { id: 'dm-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true },
        { id: 'dm-2', groupId: 'grp-1', documentId: 'doc-2', isPrimary: false },
      ])
      .run();

    const stats = getDocumentStats(db);
    expect(stats.duplicateInvolvement.documentsInGroups).toBe(2);
    expect(stats.duplicateInvolvement.percentage).toBe(67); // 2/3 = 66.7 -> 67
  });

  it('counts distinct documents for duplicate involvement', () => {
    insertTestDocuments(db);

    // doc-1 appears in two groups — should only be counted once
    db.insert(duplicateGroup)
      .values([
        {
          id: 'grp-a',
          confidenceScore: 0.9,
          algorithmVersion: 'v1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'grp-b',
          confidenceScore: 0.8,
          algorithmVersion: 'v1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    db.insert(duplicateMember)
      .values([
        { id: 'dm-a1', groupId: 'grp-a', documentId: 'doc-1', isPrimary: true },
        { id: 'dm-a2', groupId: 'grp-a', documentId: 'doc-2', isPrimary: false },
        { id: 'dm-b1', groupId: 'grp-b', documentId: 'doc-1', isPrimary: true },
        { id: 'dm-b2', groupId: 'grp-b', documentId: 'doc-3', isPrimary: false },
      ])
      .run();

    const stats = getDocumentStats(db);
    expect(stats.duplicateInvolvement.documentsInGroups).toBe(3); // doc-1, doc-2, doc-3
    expect(stats.duplicateInvolvement.percentage).toBe(100);
  });
});

describe('deleteDocumentLocally', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestDocuments(db);
  });

  it('deletes a document and all dependent rows', () => {
    // Insert dependent data for doc-1
    db.insert(documentContent)
      .values({ id: 'c-1', documentId: 'doc-1', fullText: 'text', wordCount: 1 })
      .run();
    db.insert(documentSignature)
      .values({
        id: 'sig-1',
        documentId: 'doc-1',
        minhashSignature: Buffer.from('sig'),
        algorithmVersion: 'v1',
        numPermutations: 128,
        createdAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'ai-1',
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'test',
        model: 'test-model',
        processingTimeMs: 100,
        createdAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(duplicateGroup)
      .values({
        id: 'grp-1',
        confidenceScore: 0.9,
        algorithmVersion: 'v1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    db.insert(duplicateMember)
      .values({ id: 'dm-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true })
      .run();

    deleteDocumentLocally(db, 'doc-1');

    // Document row gone
    expect(getDocument(db, 'doc-1')).toBeNull();

    // Dependent rows gone
    expect(
      db.select().from(documentContent).where(eq(documentContent.documentId, 'doc-1')).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(documentSignature).where(eq(documentSignature.documentId, 'doc-1')).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(aiProcessingResult).where(eq(aiProcessingResult.documentId, 'doc-1')).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(duplicateMember).where(eq(duplicateMember.documentId, 'doc-1')).all(),
    ).toHaveLength(0);

    // Other documents unaffected
    expect(getDocument(db, 'doc-2')).not.toBeNull();
  });

  it('is a no-op for a non-existent document ID', () => {
    expect(() => deleteDocumentLocally(db, 'nonexistent')).not.toThrow();
    // All original documents still present
    const result = getDocuments(db, {}, { limit: 50, offset: 0 });
    expect(result.total).toBe(3);
  });
});
