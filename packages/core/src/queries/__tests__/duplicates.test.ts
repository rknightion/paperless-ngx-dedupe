import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  getDuplicateGroups,
  getDuplicateGroup,
  getDuplicateStats,
  setPrimaryDocument,
  markGroupReviewed,
  markGroupResolved,
  deleteDuplicateGroup,
  batchMarkReviewed,
  batchMarkResolved,
} from '../duplicates.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';

function insertTestData(db: AppDatabase) {
  // Insert documents
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice A',
        correspondent: 'Alice',
        documentType: 'Invoice',
        tagsJson: '["finance"]',
        createdDate: '2024-01-01',
        archiveFileSize: 1000,
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Invoice B',
        correspondent: 'Alice',
        documentType: 'Invoice',
        tagsJson: '["finance","tax"]',
        createdDate: '2024-01-02',
        archiveFileSize: 2000,
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-3',
        paperlessId: 3,
        title: 'Receipt C',
        correspondent: 'Bob',
        documentType: 'Receipt',
        tagsJson: '["expense"]',
        createdDate: '2024-02-01',
        archiveFileSize: 500,
        syncedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'doc-4',
        paperlessId: 4,
        title: 'Receipt D',
        correspondent: 'Bob',
        documentType: 'Receipt',
        tagsJson: null,
        createdDate: '2024-02-02',
        archiveFileSize: 600,
        syncedAt: '2024-01-01T00:00:00Z',
      },
    ])
    .run();

  // Insert content for doc-1 and doc-2
  db.insert(documentContent)
    .values([
      { id: 'cnt-1', documentId: 'doc-1', fullText: 'Invoice text A', wordCount: 3 },
      { id: 'cnt-2', documentId: 'doc-2', fullText: 'Invoice text B', wordCount: 3 },
    ])
    .run();

  // Group 1: high confidence, unresolved (doc-1 primary, doc-2 non-primary)
  db.insert(duplicateGroup)
    .values({
      id: 'grp-1',
      confidenceScore: 0.95,
      jaccardSimilarity: 0.9,
      fuzzyTextRatio: 0.88,
      metadataSimilarity: 0.85,
      filenameSimilarity: 0.7,
      algorithmVersion: 'v1',
      createdAt: '2024-01-10T00:00:00Z',
      updatedAt: '2024-01-10T00:00:00Z',
    })
    .run();

  db.insert(duplicateMember)
    .values([
      { id: 'mem-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true },
      { id: 'mem-2', groupId: 'grp-1', documentId: 'doc-2', isPrimary: false },
    ])
    .run();

  // Group 2: lower confidence, unresolved (doc-3, doc-4)
  db.insert(duplicateGroup)
    .values({
      id: 'grp-2',
      confidenceScore: 0.6,
      algorithmVersion: 'v1',
      createdAt: '2024-02-10T00:00:00Z',
      updatedAt: '2024-02-10T00:00:00Z',
    })
    .run();

  db.insert(duplicateMember)
    .values([
      { id: 'mem-3', groupId: 'grp-2', documentId: 'doc-3', isPrimary: false },
      { id: 'mem-4', groupId: 'grp-2', documentId: 'doc-4', isPrimary: false },
    ])
    .run();
}

describe('getDuplicateGroups', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns empty for empty database', () => {
    const result = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns groups with memberCount and primaryDocumentTitle', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);

    // grp-1 first (higher confidence, desc order)
    const g1 = result.items[0];
    expect(g1.id).toBe('grp-1');
    expect(g1.confidenceScore).toBe(0.95);
    expect(g1.memberCount).toBe(2);
    expect(g1.primaryDocumentTitle).toBe('Invoice A');

    // grp-2 has no primary document
    const g2 = result.items[1];
    expect(g2.id).toBe('grp-2');
    expect(g2.memberCount).toBe(2);
    expect(g2.primaryDocumentTitle).toBeNull();
  });

  it('filters by minConfidence', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { minConfidence: 0.8, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('grp-1');
  });

  it('filters by maxConfidence', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { maxConfidence: 0.7, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('grp-2');
  });

  it('filters by reviewed', () => {
    insertTestData(db);
    markGroupReviewed(db, 'grp-1');

    const reviewed = getDuplicateGroups(
      db,
      { reviewed: true, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );
    expect(reviewed.items).toHaveLength(1);
    expect(reviewed.items[0].id).toBe('grp-1');

    const unreviewed = getDuplicateGroups(
      db,
      { reviewed: false, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );
    expect(unreviewed.items).toHaveLength(1);
    expect(unreviewed.items[0].id).toBe('grp-2');
  });

  it('filters by resolved', () => {
    insertTestData(db);
    markGroupResolved(db, 'grp-2');

    const resolved = getDuplicateGroups(
      db,
      { resolved: true, sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].id).toBe('grp-2');
  });

  it('sorts by confidence desc (default)', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items[0].confidenceScore).toBeGreaterThan(result.items[1].confidenceScore);
  });

  it('sorts by confidence asc', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'asc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items[0].confidenceScore).toBeLessThan(result.items[1].confidenceScore);
  });

  it('sorts by created_at', () => {
    insertTestData(db);
    const result = getDuplicateGroups(
      db,
      { sortBy: 'created_at', sortOrder: 'asc' },
      { limit: 50, offset: 0 },
    );

    expect(result.items[0].id).toBe('grp-1'); // earlier createdAt
    expect(result.items[1].id).toBe('grp-2');
  });

  it('paginates correctly', () => {
    insertTestData(db);
    const page1 = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 1, offset: 0 },
    );
    const page2 = getDuplicateGroups(
      db,
      { sortBy: 'confidence', sortOrder: 'desc' },
      { limit: 1, offset: 1 },
    );

    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });
});

describe('getDuplicateGroup', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns null for non-existent ID', () => {
    expect(getDuplicateGroup(db, 'nonexistent')).toBeNull();
  });

  it('returns full group with members including content', () => {
    insertTestData(db);
    const result = getDuplicateGroup(db, 'grp-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('grp-1');
    expect(result!.confidenceScore).toBe(0.95);
    expect(result!.jaccardSimilarity).toBe(0.9);
    expect(result!.fuzzyTextRatio).toBe(0.88);
    expect(result!.algorithmVersion).toBe('v1');
    expect(result!.reviewed).toBe(false);
    expect(result!.resolved).toBe(false);
    expect(result!.members).toHaveLength(2);

    const primary = result!.members.find((m) => m.isPrimary);
    expect(primary).toBeDefined();
    expect(primary!.title).toBe('Invoice A');
    expect(primary!.content).not.toBeNull();
    expect(primary!.content!.fullText).toBe('Invoice text A');
    expect(primary!.content!.wordCount).toBe(3);
  });

  it('members have correct tags parsed', () => {
    insertTestData(db);
    const result = getDuplicateGroup(db, 'grp-1');

    const mem1 = result!.members.find((m) => m.documentId === 'doc-1');
    const mem2 = result!.members.find((m) => m.documentId === 'doc-2');

    expect(mem1!.tags).toEqual(['finance']);
    expect(mem2!.tags).toEqual(['finance', 'tax']);
  });

  it('members with null tagsJson get empty array', () => {
    insertTestData(db);
    const result = getDuplicateGroup(db, 'grp-2');

    const mem4 = result!.members.find((m) => m.documentId === 'doc-4');
    expect(mem4!.tags).toEqual([]);
  });
});

describe('getDuplicateStats', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns zero counts for empty database', () => {
    const stats = getDuplicateStats(db);

    expect(stats.totalGroups).toBe(0);
    expect(stats.reviewedGroups).toBe(0);
    expect(stats.resolvedGroups).toBe(0);
    expect(stats.unresolvedGroups).toBe(0);
    expect(stats.topCorrespondents).toEqual([]);
    expect(stats.confidenceDistribution).toHaveLength(6);
    expect(stats.confidenceDistribution.every((b) => b.count === 0)).toBe(true);
  });

  it('returns correct totals and histogram buckets', () => {
    insertTestData(db);
    markGroupReviewed(db, 'grp-1');

    const stats = getDuplicateStats(db);

    expect(stats.totalGroups).toBe(2);
    expect(stats.reviewedGroups).toBe(1);
    expect(stats.resolvedGroups).toBe(0);
    expect(stats.unresolvedGroups).toBe(2);

    // grp-1 at 0.95 -> "95-100%" bucket
    const bucket95 = stats.confidenceDistribution.find((b) => b.label === '95-100%');
    expect(bucket95!.count).toBe(1);

    // grp-2 at 0.6 -> "50-75%" bucket
    const bucket50 = stats.confidenceDistribution.find((b) => b.label === '50-75%');
    expect(bucket50!.count).toBe(1);
  });

  it('returns topCorrespondents', () => {
    insertTestData(db);
    const stats = getDuplicateStats(db);

    expect(stats.topCorrespondents.length).toBeGreaterThanOrEqual(1);
    // Alice is in grp-1 (doc-1, doc-2), Bob in grp-2 (doc-3, doc-4) => each has 1 group
    const alice = stats.topCorrespondents.find((c) => c.correspondent === 'Alice');
    const bob = stats.topCorrespondents.find((c) => c.correspondent === 'Bob');
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice!.groupCount).toBe(1);
    expect(bob!.groupCount).toBe(1);
  });
});

describe('setPrimaryDocument', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('sets a new primary document', () => {
    const result = setPrimaryDocument(db, 'grp-1', 'doc-2');
    expect(result).toBe(true);

    const group = getDuplicateGroup(db, 'grp-1');
    const primary = group!.members.find((m) => m.isPrimary);
    expect(primary!.documentId).toBe('doc-2');
  });

  it('returns false for missing group', () => {
    expect(setPrimaryDocument(db, 'nonexistent', 'doc-1')).toBe(false);
  });

  it('returns false for non-member document', () => {
    // doc-3 is not in grp-1
    expect(setPrimaryDocument(db, 'grp-1', 'doc-3')).toBe(false);
  });
});

describe('markGroupReviewed', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('marks a group as reviewed', () => {
    const result = markGroupReviewed(db, 'grp-1');
    expect(result).toBe(true);

    const group = getDuplicateGroup(db, 'grp-1');
    expect(group!.reviewed).toBe(true);
  });

  it('returns false for missing group', () => {
    expect(markGroupReviewed(db, 'nonexistent')).toBe(false);
  });
});

describe('markGroupResolved', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('marks a group as resolved', () => {
    const result = markGroupResolved(db, 'grp-1');
    expect(result).toBe(true);

    const group = getDuplicateGroup(db, 'grp-1');
    expect(group!.resolved).toBe(true);
  });

  it('returns false for missing group', () => {
    expect(markGroupResolved(db, 'nonexistent')).toBe(false);
  });
});

describe('deleteDuplicateGroup', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('deletes a group and its members via cascade', () => {
    const result = deleteDuplicateGroup(db, 'grp-1');
    expect(result).toBe(true);

    expect(getDuplicateGroup(db, 'grp-1')).toBeNull();

    // Members should be cascade-deleted
    const members = db
      .select()
      .from(duplicateMember)
      .where(eq(duplicateMember.groupId, 'grp-1'))
      .all();
    expect(members).toHaveLength(0);
  });

  it('returns false for missing group', () => {
    expect(deleteDuplicateGroup(db, 'nonexistent')).toBe(false);
  });
});

describe('batchMarkReviewed', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('marks multiple groups as reviewed', () => {
    const { updated } = batchMarkReviewed(db, ['grp-1', 'grp-2']);
    expect(updated).toBe(2);

    expect(getDuplicateGroup(db, 'grp-1')!.reviewed).toBe(true);
    expect(getDuplicateGroup(db, 'grp-2')!.reviewed).toBe(true);
  });

  it('returns correct updated count for non-existent IDs', () => {
    const { updated } = batchMarkReviewed(db, ['grp-1', 'nonexistent']);
    expect(updated).toBe(1);
  });
});

describe('batchMarkResolved', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    insertTestData(db);
  });

  it('marks multiple groups as resolved', () => {
    const { updated } = batchMarkResolved(db, ['grp-1', 'grp-2']);
    expect(updated).toBe(2);

    expect(getDuplicateGroup(db, 'grp-1')!.resolved).toBe(true);
    expect(getDuplicateGroup(db, 'grp-2')!.resolved).toBe(true);
  });

  it('returns correct updated count for non-existent IDs', () => {
    const { updated } = batchMarkResolved(db, ['grp-2', 'fake-id']);
    expect(updated).toBe(1);
  });
});
