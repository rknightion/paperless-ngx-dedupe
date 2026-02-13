import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getDashboard } from '../dashboard.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { syncState } from '../../schema/sqlite/app.js';

describe('getDashboard', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns all zeros/nulls for an empty database', () => {
    const result = getDashboard(db);

    expect(result.totalDocuments).toBe(0);
    expect(result.unresolvedGroups).toBe(0);
    expect(result.storageSavingsBytes).toBe(0);
    expect(result.pendingAnalysis).toBe(0);
    expect(result.lastSyncAt).toBeNull();
    expect(result.lastSyncDocumentCount).toBeNull();
    expect(result.lastAnalysisAt).toBeNull();
    expect(result.totalDuplicateGroups).toBeNull();
    expect(result.topCorrespondents).toEqual([]);
  });

  it('returns correct counts with populated data', () => {
    // Insert documents
    db.insert(document)
      .values([
        {
          id: 'doc-1',
          paperlessId: 1,
          title: 'Doc A',
          correspondent: 'Alice',
          processingStatus: 'completed',
          archiveFileSize: 1000,
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-2',
          paperlessId: 2,
          title: 'Doc B',
          correspondent: 'Alice',
          processingStatus: 'completed',
          archiveFileSize: 2000,
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-3',
          paperlessId: 3,
          title: 'Doc C',
          correspondent: 'Bob',
          processingStatus: 'pending',
          archiveFileSize: 3000,
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    // Insert an unresolved duplicate group
    db.insert(duplicateGroup)
      .values({
        id: 'grp-1',
        confidenceScore: 0.9,
        algorithmVersion: 'v1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    // Insert a resolved duplicate group
    db.insert(duplicateGroup)
      .values({
        id: 'grp-2',
        confidenceScore: 0.8,
        algorithmVersion: 'v1',
        resolved: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    // Members for unresolved group: doc-1 is primary, doc-2 is non-primary
    db.insert(duplicateMember)
      .values([
        { id: 'mem-1', groupId: 'grp-1', documentId: 'doc-1', isPrimary: true },
        { id: 'mem-2', groupId: 'grp-1', documentId: 'doc-2', isPrimary: false },
      ])
      .run();

    // Insert sync state
    db.insert(syncState)
      .values({
        id: 'singleton',
        lastSyncAt: '2024-06-01T12:00:00Z',
        lastSyncDocumentCount: 100,
        lastAnalysisAt: '2024-06-01T13:00:00Z',
        totalDocuments: 100,
        totalDuplicateGroups: 5,
      })
      .run();

    const result = getDashboard(db);

    expect(result.totalDocuments).toBe(3);
    expect(result.unresolvedGroups).toBe(1);
    // Storage savings = archiveFileSize of non-primary members in unresolved groups = doc-2's 2000
    expect(result.storageSavingsBytes).toBe(2000);
    expect(result.pendingAnalysis).toBe(1);
    expect(result.lastSyncAt).toBe('2024-06-01T12:00:00Z');
    expect(result.lastSyncDocumentCount).toBe(100);
    expect(result.lastAnalysisAt).toBe('2024-06-01T13:00:00Z');
    expect(result.totalDuplicateGroups).toBe(5);
  });

  it('returns topCorrespondents ranked by group count', () => {
    // Alice has 2 groups, Bob has 1
    db.insert(document)
      .values([
        {
          id: 'doc-1',
          paperlessId: 1,
          title: 'A1',
          correspondent: 'Alice',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-2',
          paperlessId: 2,
          title: 'A2',
          correspondent: 'Alice',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-3',
          paperlessId: 3,
          title: 'B1',
          correspondent: 'Bob',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-4',
          paperlessId: 4,
          title: 'A3',
          correspondent: 'Alice',
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    db.insert(duplicateGroup)
      .values([
        {
          id: 'grp-1',
          confidenceScore: 0.9,
          algorithmVersion: 'v1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'grp-2',
          confidenceScore: 0.8,
          algorithmVersion: 'v1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    db.insert(duplicateMember)
      .values([
        { id: 'mem-1', groupId: 'grp-1', documentId: 'doc-1' },
        { id: 'mem-2', groupId: 'grp-1', documentId: 'doc-3' },
        { id: 'mem-3', groupId: 'grp-2', documentId: 'doc-2' },
        { id: 'mem-4', groupId: 'grp-2', documentId: 'doc-4' },
      ])
      .run();

    const result = getDashboard(db);

    expect(result.topCorrespondents.length).toBeGreaterThanOrEqual(1);
    // Alice appears in grp-1 (via doc-1) and grp-2 (via doc-2, doc-4) = 2 groups
    // Bob appears in grp-1 (via doc-3) = 1 group
    expect(result.topCorrespondents[0].correspondent).toBe('Alice');
    expect(result.topCorrespondents[0].groupCount).toBe(2);
  });
});
