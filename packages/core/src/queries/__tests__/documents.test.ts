import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getDocuments, getDocument } from '../documents.js';
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
        originalFileSize: 1000,
        archiveFileSize: 800,
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
        originalFileSize: 500,
        archiveFileSize: 400,
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
        originalFileSize: 2000,
        archiveFileSize: 1500,
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
      reviewed: false,
      resolved: false,
    });
  });

  it('returns empty groupMemberships when document has no groups', () => {
    insertTestDocuments(db);

    const result = getDocument(db, 'doc-1');

    expect(result).not.toBeNull();
    expect(result!.groupMemberships).toEqual([]);
  });
});
