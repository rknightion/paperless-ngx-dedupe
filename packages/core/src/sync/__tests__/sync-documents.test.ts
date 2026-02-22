import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { syncDocuments } from '../sync-documents.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { syncState } from '../../schema/sqlite/app.js';
import { eq } from 'drizzle-orm';
import type { PaperlessDocument, DocumentMetadata } from '../../paperless/types.js';
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

function makeMetadata(id: number, overrides?: Partial<DocumentMetadata>): DocumentMetadata {
  return {
    originalChecksum: `checksum-${id}`,
    originalSize: 1000 * id,
    originalMimeType: 'application/pdf',
    mediaFilename: `doc${id}.pdf`,
    hasArchiveVersion: true,
    archiveChecksum: `archive-checksum-${id}`,
    archiveSize: 800 * id,
    archiveMediaFilename: `doc${id}-archive.pdf`,
    ...overrides,
  };
}

interface MockClientOptions {
  docs: PaperlessDocument[];
  pageSize?: number;
  metadataMap?: Map<number, DocumentMetadata>;
  metadataFn?: (id: number) => Promise<DocumentMetadata>;
}

function createMockClient(options: MockClientOptions): PaperlessClient {
  const { docs, pageSize, metadataMap, metadataFn } = options;
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
    async getDocumentMetadata(id: number): Promise<DocumentMetadata> {
      if (metadataFn) return metadataFn(id);
      if (metadataMap) {
        const meta = metadataMap.get(id);
        if (meta) return meta;
      }
      return makeMetadata(id);
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

  describe('metadata fetching', () => {
    it('should fetch and store file sizes for new documents', async () => {
      const docs = [makePaperlessDoc(1), makePaperlessDoc(2)];
      const metadataMap = new Map([
        [1, makeMetadata(1, { originalSize: 5000, archiveSize: 4000 })],
        [2, makeMetadata(2, { originalSize: 10000, archiveSize: 8000 })],
      ]);
      const client = createMockClient({ docs, metadataMap });

      await syncDocuments({ db, client });

      const dbDocs = db.select().from(document).orderBy(document.paperlessId).all();
      expect(dbDocs[0].originalFileSize).toBe(5000);
      expect(dbDocs[0].archiveFileSize).toBe(4000);
      expect(dbDocs[1].originalFileSize).toBe(10000);
      expect(dbDocs[1].archiveFileSize).toBe(8000);
    });

    it('should fetch metadata for updated documents', async () => {
      const docs = [makePaperlessDoc(1)];
      const client = createMockClient({
        docs,
        metadataMap: new Map([[1, makeMetadata(1, { originalSize: 5000, archiveSize: 4000 })]]),
      });

      // First sync
      await syncDocuments({ db, client });

      // Modify doc and re-sync with new metadata
      const modifiedDocs = [
        makePaperlessDoc(1, { title: 'Updated', modified: '2024-07-01T00:00:00Z' }),
      ];
      const updatedClient = createMockClient({
        docs: modifiedDocs,
        metadataMap: new Map([[1, makeMetadata(1, { originalSize: 6000, archiveSize: 5000 })]]),
      });

      await syncDocuments({ db, client: updatedClient }, { forceFullSync: true });

      const dbDocs = db.select().from(document).all();
      expect(dbDocs[0].originalFileSize).toBe(6000);
      expect(dbDocs[0].archiveFileSize).toBe(5000);
    });

    it('should not fetch metadata for skipped (unchanged) documents', async () => {
      const metadataFn = vi.fn().mockResolvedValue(makeMetadata(1));
      const docs = [makePaperlessDoc(1)];
      const client = createMockClient({ docs, metadataFn });

      // First sync - metadata fetched
      await syncDocuments({ db, client });
      expect(metadataFn).toHaveBeenCalledTimes(1);

      metadataFn.mockClear();

      // Second sync - doc unchanged, no metadata fetch
      await syncDocuments({ db, client }, { forceFullSync: true });
      expect(metadataFn).not.toHaveBeenCalled();
    });

    it('should handle null archiveSize gracefully', async () => {
      const docs = [makePaperlessDoc(1)];
      const client = createMockClient({
        docs,
        metadataMap: new Map([[1, makeMetadata(1, { archiveSize: null })]]),
      });

      await syncDocuments({ db, client });

      const dbDocs = db.select().from(document).all();
      expect(dbDocs[0].originalFileSize).toBe(1000);
      expect(dbDocs[0].archiveFileSize).toBeNull();
    });

    it('should continue sync when metadata fetch fails for a document', async () => {
      const docs = [makePaperlessDoc(1), makePaperlessDoc(2), makePaperlessDoc(3)];
      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        if (id === 2) throw new Error('Network timeout');
        return makeMetadata(id);
      });
      const client = createMockClient({ docs, metadataFn });

      const result = await syncDocuments({ db, client });

      // All docs should still be inserted despite metadata failure
      expect(result.inserted).toBe(3);
      expect(result.failed).toBe(0);

      // Doc 1 and 3 have metadata, doc 2 does not
      const dbDocs = db.select().from(document).orderBy(document.paperlessId).all();
      expect(dbDocs[0].originalFileSize).toBe(1000);
      expect(dbDocs[1].originalFileSize).toBeNull();
      expect(dbDocs[2].originalFileSize).toBe(3000);
    });

    it('should call getDocumentMetadata for each inserted/updated doc', async () => {
      const metadataFn = vi.fn().mockImplementation(async (id: number) => makeMetadata(id));
      const docs = [makePaperlessDoc(1), makePaperlessDoc(2), makePaperlessDoc(3)];
      const client = createMockClient({ docs, metadataFn });

      await syncDocuments({ db, client });

      expect(metadataFn).toHaveBeenCalledTimes(3);
      expect(metadataFn).toHaveBeenCalledWith(1);
      expect(metadataFn).toHaveBeenCalledWith(2);
      expect(metadataFn).toHaveBeenCalledWith(3);
    });
  });

  describe('metadata concurrency', () => {
    it('should respect metadataConcurrency option', async () => {
      // Create enough docs to exceed the concurrency limit
      const docs = Array.from({ length: 8 }, (_, i) => makePaperlessDoc(i + 1));
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        // Simulate async work so concurrency control kicks in
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return makeMetadata(id);
      });

      const client = createMockClient({ docs, metadataFn });
      await syncDocuments({ db, client }, { metadataConcurrency: 3 });

      expect(metadataFn).toHaveBeenCalledTimes(8);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should default to 10 concurrency when not specified', async () => {
      const docs = Array.from({ length: 15 }, (_, i) => makePaperlessDoc(i + 1));
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return makeMetadata(id);
      });

      const client = createMockClient({ docs, metadataFn });
      await syncDocuments({ db, client });

      expect(metadataFn).toHaveBeenCalledTimes(15);
      expect(maxConcurrent).toBeLessThanOrEqual(10);
    });
  });

  describe('pipelined metadata', () => {
    it('should start metadata fetches during document processing, not after', async () => {
      const events: string[] = [];

      // Create docs across 2 pages
      const docs = Array.from({ length: 4 }, (_, i) => makePaperlessDoc(i + 1));
      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        events.push(`meta-start-${id}`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`meta-end-${id}`);
        return makeMetadata(id);
      });

      const client = createMockClient({ docs, pageSize: 2, metadataFn });

      const progressCalls: Array<{ progress: number; message?: string }> = [];
      await syncDocuments(
        { db, client },
        {
          metadataConcurrency: 4,
          onProgress: async (progress, message) => {
            progressCalls.push({ progress, message });
          },
        },
      );

      // Metadata should have been called for all 4 docs
      expect(metadataFn).toHaveBeenCalledTimes(4);

      // Verify metadata starts were interleaved (not all after docs finish)
      // With 2 pages of 2 docs each: page 1 docs should trigger metadata before page 2 starts
      const firstMetaStart = events.indexOf('meta-start-1');
      expect(firstMetaStart).toBeGreaterThanOrEqual(0);
    });

    it('should drain all metadata before completing sync', async () => {
      const docs = Array.from({ length: 6 }, (_, i) => makePaperlessDoc(i + 1));
      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return makeMetadata(id);
      });

      const client = createMockClient({ docs, metadataFn });
      await syncDocuments({ db, client }, { metadataConcurrency: 2 });

      // All 6 metadata fetches should have completed
      expect(metadataFn).toHaveBeenCalledTimes(6);

      // All docs should have file sizes populated
      const dbDocs = db.select().from(document).orderBy(document.paperlessId).all();
      for (const doc of dbDocs) {
        expect(doc.originalFileSize).not.toBeNull();
      }
    });
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

    it('should allocate doc fetch in 2%-20% range and metadata in 20%-95% range', async () => {
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

      // Find metadata progress calls (should be between 0.20 and 0.95)
      const metaCalls = progressCalls.filter((c) => c.message?.startsWith('Fetching metadata'));
      for (const call of metaCalls) {
        expect(call.progress).toBeGreaterThanOrEqual(0.2);
        expect(call.progress).toBeLessThanOrEqual(0.95);
      }

      // Final call should be 1.0
      expect(progressCalls[progressCalls.length - 1].progress).toBe(1);
    });

    it('should include metadata drain progress messages', async () => {
      const docs = Array.from({ length: 4 }, (_, i) => makePaperlessDoc(i + 1));
      const metadataFn = vi.fn().mockImplementation(async (id: number) => {
        // Add delay so some metadata drains after the doc loop
        await new Promise((r) => setTimeout(r, 15));
        return makeMetadata(id);
      });

      const client = createMockClient({ docs, metadataFn });
      const progressCalls: Array<{ progress: number; message?: string }> = [];

      await syncDocuments(
        { db, client },
        {
          metadataConcurrency: 2,
          onProgress: async (progress, message) => {
            progressCalls.push({ progress, message });
          },
        },
      );

      // Should have at least one "Fetching metadata" or "Fetched metadata" message
      const metaMessages = progressCalls.filter((c) => c.message?.includes('metadata'));
      expect(metaMessages.length).toBeGreaterThan(0);
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
      // Should process page 1 (doc 4 new, doc 3 old → triggers stop)
      // then break before fetching page 2
      expect(result.totalFetched).toBe(2);
      expect(result.inserted).toBe(1); // doc 4
      expect(result.skipped).toBe(1); // doc 3 unchanged
    });
  });
});
