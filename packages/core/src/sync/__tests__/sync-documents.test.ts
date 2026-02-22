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

interface MockClientOptions {
  docs: PaperlessDocument[];
  pageSize?: number;
}

function createMockClient(options: MockClientOptions): PaperlessClient {
  const { docs, pageSize } = options;
  const effectivePageSize = pageSize ?? docs.length;

  return {
    async *getDocuments() {
      for (let i = 0; i < docs.length; i += effectivePageSize) {
        yield {
          results: docs.slice(i, i + effectivePageSize),
          totalCount: docs.length,
        };
      }
    },
    async getTags() {
      return [
        {
          id: 1,
          name: 'Tag1',
          slug: 'tag1',
          color: '#000',
          textColor: '#fff',
          isInboxTag: false,
          matchingAlgorithm: 0,
          match: '',
          documentCount: 0,
        },
        {
          id: 2,
          name: 'Tag2',
          slug: 'tag2',
          color: '#000',
          textColor: '#fff',
          isInboxTag: false,
          matchingAlgorithm: 0,
          match: '',
          documentCount: 0,
        },
      ];
    },
    async getCorrespondents() {
      return [
        {
          id: 1,
          name: 'Correspondent1',
          slug: 'correspondent1',
          matchingAlgorithm: 0,
          match: '',
          documentCount: 0,
          lastCorrespondence: null,
        },
      ];
    },
    async getDocumentTypes() {
      return [
        {
          id: 1,
          name: 'Type1',
          slug: 'type1',
          matchingAlgorithm: 0,
          match: '',
          documentCount: 0,
        },
      ];
    },
  } as unknown as PaperlessClient;
}

/** Shorthand for simple test cases that just need a doc list. */
function createSimpleClient(docs: PaperlessDocument[]): PaperlessClient {
  return createMockClient({ docs });
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
    const client = createSimpleClient(docs);

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
    const client = createSimpleClient(docs);

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
    const client = createSimpleClient(docs);

    // First sync
    await syncDocuments({ db, client }, { forceFullSync: true });

    // Modify doc
    const modifiedDocs = [
      makePaperlessDoc(1, { title: 'Updated Title', modified: '2024-07-01T00:00:00Z' }),
    ];
    const modifiedClient = createSimpleClient(modifiedDocs);

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
    const client = createSimpleClient(docs);

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
    const client = createSimpleClient(docs);

    await syncDocuments({ db, client });

    const state = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();
    expect(state).not.toBeNull();
    expect(state!.lastSyncAt).toBeTruthy();
    expect(state!.totalDocuments).toBe(1);
    expect(state!.lastSyncDocumentCount).toBe(1);
  });

  it('should handle all documents successfully with no errors', async () => {
    const docs = [makePaperlessDoc(1), makePaperlessDoc(2), makePaperlessDoc(3)];
    const client = createSimpleClient(docs);

    const result = await syncDocuments({ db, client });
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should resolve tag names from IDs', async () => {
    const docs = [makePaperlessDoc(1, { tags: [1, 2] })];
    const client = createSimpleClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    const tags = JSON.parse(dbDocs[0].tagsJson!);
    expect(tags).toEqual(['Tag1', 'Tag2']);
  });

  it('should resolve correspondent name', async () => {
    const docs = [makePaperlessDoc(1, { correspondent: 1 })];
    const client = createSimpleClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].correspondent).toBe('Correspondent1');
  });

  it('should resolve document type name', async () => {
    const docs = [makePaperlessDoc(1, { documentType: 1 })];
    const client = createSimpleClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].documentType).toBe('Type1');
  });

  it('should use incremental sync when lastSyncAt exists', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createSimpleClient(docs);

    // First full sync
    await syncDocuments({ db, client }, { forceFullSync: true });

    // Second sync should be incremental
    const result = await syncDocuments({ db, client });
    expect(result.syncType).toBe('incremental');
  });

  it('should force full sync when option is set', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createSimpleClient(docs);

    // First sync
    await syncDocuments({ db, client });

    // Force full sync
    const result = await syncDocuments({ db, client }, { forceFullSync: true });
    expect(result.syncType).toBe('full');
  });

  it('should set processingStatus to pending for new docs', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createSimpleClient(docs);

    await syncDocuments({ db, client });

    const dbDocs = db.select().from(document).all();
    expect(dbDocs[0].processingStatus).toBe('pending');
  });

  it('should return correct duration', async () => {
    const docs = [makePaperlessDoc(1)];
    const client = createSimpleClient(docs);

    const result = await syncDocuments({ db, client });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  describe('progress reporting', () => {
    it('should call progress callback', async () => {
      const docs = [makePaperlessDoc(1)];
      const client = createSimpleClient(docs);
      const progressCalls: Array<{ progress: number; message?: string }> = [];

      await syncDocuments(
        { db, client },
        {
          onProgress: async (progress, message) => {
            progressCalls.push({ progress, message });
          },
        },
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      // First call should be 0 (starting)
      expect(progressCalls[0].progress).toBe(0);
      // Last call should be 1 (complete)
      expect(progressCalls[progressCalls.length - 1].progress).toBe(1);
    });

    it('should report progress monotonically increasing', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => makePaperlessDoc(i + 1));
      const client = createSimpleClient(docs);
      const progressValues: number[] = [];

      await syncDocuments(
        { db, client },
        {
          onProgress: async (progress) => {
            progressValues.push(progress);
          },
        },
      );

      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('should allocate doc fetch in 2%-95% range', async () => {
      const docs = Array.from({ length: 3 }, (_, i) => makePaperlessDoc(i + 1));
      const client = createSimpleClient(docs);
      const progressCalls: Array<{ progress: number; message?: string }> = [];

      await syncDocuments(
        { db, client },
        {
          onProgress: async (progress, message) => {
            progressCalls.push({ progress, message });
          },
        },
      );

      // Find reference data progress (should be at 0.02)
      const refDataCall = progressCalls.find((c) => c.message === 'Loaded reference data');
      expect(refDataCall?.progress).toBe(0.02);

      // Find doc syncing progress calls (should be between 0.02 and 0.95)
      const syncingCalls = progressCalls.filter((c) => c.message?.startsWith('Syncing documents'));
      for (const call of syncingCalls) {
        expect(call.progress).toBeGreaterThanOrEqual(0.02);
        expect(call.progress).toBeLessThanOrEqual(0.95);
      }

      // Final call should be 1.0
      expect(progressCalls[progressCalls.length - 1].progress).toBe(1);
    });
  });

  describe('multi-page sync', () => {
    it('should handle documents spread across multiple pages', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => makePaperlessDoc(i + 1));
      const client = createMockClient({ docs, pageSize: 2 });

      const result = await syncDocuments({ db, client });

      expect(result.inserted).toBe(5);
      expect(result.totalFetched).toBe(5);

      const dbDocs = db.select().from(document).all();
      expect(dbDocs).toHaveLength(5);
    });

    it('should stop incremental sync when reaching docs older than lastSyncAt', async () => {
      // First sync with 3 docs
      const initialDocs = [
        makePaperlessDoc(1, { modified: '2024-01-01T00:00:00Z' }),
        makePaperlessDoc(2, { modified: '2024-02-01T00:00:00Z' }),
        makePaperlessDoc(3, { modified: '2024-03-01T00:00:00Z' }),
      ];
      const initialClient = createSimpleClient(initialDocs);
      await syncDocuments({ db, client: initialClient }, { forceFullSync: true });

      // Incremental sync: newest first, should stop when hitting old docs
      // Page 1: doc 4 (new), doc 3 (old, triggers cutoff)
      const incrementalDocs = [
        makePaperlessDoc(4, { modified: '2024-07-01T00:00:00Z' }),
        makePaperlessDoc(3, { modified: '2024-03-01T00:00:00Z' }),
        makePaperlessDoc(2, { modified: '2024-02-01T00:00:00Z' }),
        makePaperlessDoc(1, { modified: '2024-01-01T00:00:00Z' }),
      ];
      const incrementalClient = createMockClient({ docs: incrementalDocs, pageSize: 2 });

      const result = await syncDocuments({ db, client: incrementalClient });
      expect(result.syncType).toBe('incremental');
      // Should process page 1 (doc 4 new, doc 3 old -> triggers stop)
      // then break before fetching page 2
      expect(result.totalFetched).toBe(2);
      expect(result.inserted).toBe(1); // doc 4
      expect(result.skipped).toBe(1); // doc 3 unchanged
    });
  });
});
