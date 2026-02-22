import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getDocuments, getDocument, getDocumentStats } from '../documents.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';

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
