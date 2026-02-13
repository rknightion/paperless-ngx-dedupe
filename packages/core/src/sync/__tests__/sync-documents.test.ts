import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { syncDocuments } from '../sync-documents.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { syncState } from '../../schema/sqlite/app.js';
import { eq } from 'drizzle-orm';
import type { PaperlessDocument } from '../../paperless/types.js';
import type { PaperlessClient } from '../../paperless/client.js';

function makePaperlessDoc(id: number, overrides?: Partial<PaperlessDocument>): PaperlessDocument {
  return {
    id,
    title: `Document ${id}`,
    content: `Content for document ${id}`,
    tags: [1, 2],
    correspondent: 1,
    documentType: 1,
    created: '2024-01-01T00:00:00Z',
    modified: '2024-06-01T00:00:00Z',
    added: '2024-01-01T00:00:00Z',
    originalFileName: `doc${id}.pdf`,
    archivedFileName: null,
    archiveSerialNumber: null,
    ...overrides,
  };
}

function createMockClient(docs: PaperlessDocument[]): PaperlessClient {
  return {
    async *getDocuments() {
      yield docs;
    },
    async getTags() {
      return [
        { id: 1, name: 'Tag1', color: '#000', textColor: '#fff', isInboxTag: false, matchingAlgorithm: 0, match: '', documentCount: 0 },
        { id: 2, name: 'Tag2', color: '#000', textColor: '#fff', isInboxTag: false, matchingAlgorithm: 0, match: '', documentCount: 0 },
      ];
    },
    async getCorrespondents() {
      return [
        { id: 1, name: 'Correspondent1', matchingAlgorithm: 0, match: '', documentCount: 0 },
      ];
    },
    async getDocumentTypes() {
      return [
        { id: 1, name: 'Type1', matchingAlgorithm: 0, match: '', documentCount: 0 },
      ];
    },
  } as unknown as PaperlessClient;
}

describe('syncDocuments', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('should insert all documents on full sync', async () => {
    const docs = [makePaperlessDoc(1), makePaperlessDoc(2), makePaperlessDoc(3)];
    const client = createMockClient(docs);

    const result = await syncDocuments({ db, client });

    expect(result.syncType).toBe('full');
    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.totalFetched).toBe(3);

    // Verify documents in DB
    const dbDocs = db.select().from(document).all();
    expect(dbDocs).toHaveLength(3);
  });

  it('should skip unchanged documents on re-sync', async () => {
    const docs = [makePaperlessDoc(1), makePaperlessDoc(2)];
    const client = createMockClient(docs);

    // First sync
    await syncDocuments({ db, client }, { forceFullSync: true });

    // Second sync - same docs
    const result = await syncDocuments({ db, client }, { forceFullSync: true });

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.updated).toBe(0);
  });

  it('should update modified documents', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    // First sync
    await syncDocuments({ db, client }, { forceFullSync: true });

    // Modify doc
    const modifiedDocs = [makePaperlessDoc(1, { title: 'Updated Title', modified: '2024-07-01T00:00:00Z' })];
    const modifiedClient = createMockClient(modifiedDocs);

    // Second sync
    const result = await syncDocuments({ db, client: modifiedClient }, { forceFullSync: true });

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);

    // Verify updated in DB
    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].title).toBe('Updated Title');
  });

  it('should store document content with normalization', async () => {
    const docs = [makePaperlessDoc(1, { content: '  Hello   WORLD  \n\n  Test  ' })];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const contents = db.select().from(documentContent).all();
    expect(contents).toHaveLength(1);
    expect(contents[0].fullText).toBe('  Hello   WORLD  \n\n  Test  ');
    expect(contents[0].normalizedText).toBe('hello world test');
    expect(contents[0].wordCount).toBe(3);
    expect(contents[0].contentHash).toBeTruthy();
  });

  it('should update sync state', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const state = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();
    expect(state).not.toBeNull();
    expect(state!.lastSyncAt).toBeTruthy();
    expect(state!.totalDocuments).toBe(1);
    expect(state!.lastSyncDocumentCount).toBe(1);
  });

  it('should call progress callback', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);
    const progressCalls: Array<{ progress: number; message?: string }> = [];

    await syncDocuments({ db, client }, {
      onProgress: async (progress, message) => {
        progressCalls.push({ progress, message });
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // First call should be 0 (starting)
    expect(progressCalls[0].progress).toBe(0);
    // Last call should be 1 (complete)
    expect(progressCalls[progressCalls.length - 1].progress).toBe(1);
  });

  it('should handle all documents successfully with no errors', async () => {
    const docs = [makePaperlessDoc(1), makePaperlessDoc(2), makePaperlessDoc(3)];
    const client = createMockClient(docs);

    const result = await syncDocuments({ db, client });
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should resolve tag names from IDs', async () => {
    const docs = [makePaperlessDoc(1, { tags: [1, 2] })];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    const tags = JSON.parse(dbDocs[0].tagsJson!);
    expect(tags).toEqual(['Tag1', 'Tag2']);
  });

  it('should resolve correspondent name', async () => {
    const docs = [makePaperlessDoc(1, { correspondent: 1 })];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].correspondent).toBe('Correspondent1');
  });

  it('should resolve document type name', async () => {
    const docs = [makePaperlessDoc(1, { documentType: 1 })];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].documentType).toBe('Type1');
  });

  it('should use incremental sync when lastSyncAt exists', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    // First full sync
    await syncDocuments({ db, client }, { forceFullSync: true });

    // Second sync should be incremental
    const result = await syncDocuments({ db, client });
    expect(result.syncType).toBe('incremental');
  });

  it('should force full sync when option is set', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    // First sync
    await syncDocuments({ db, client });

    // Force full sync
    const result = await syncDocuments({ db, client }, { forceFullSync: true });
    expect(result.syncType).toBe('full');
  });

  it('should set processingStatus to pending for new docs', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].processingStatus).toBe('pending');
  });

  it('should return correct duration', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createMockClient(docs);

    const result = await syncDocuments({ db, client });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
