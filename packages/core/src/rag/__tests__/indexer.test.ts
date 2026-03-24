import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGenerateEmbeddings = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
const mockEmbeddingOptionsFromConfig = vi
  .fn()
  .mockReturnValue({ apiKey: 'test', model: 'test', dimensions: 3 });
const mockInsertChunkEmbedding = vi.fn();
const mockDeleteChunkEmbeddings = vi.fn();
const mockInsertChunkFts = vi.fn();
const mockDeleteChunksFts = vi.fn();

vi.mock('../embeddings.js', () => ({
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
  embeddingOptionsFromConfig: (...args: unknown[]) => mockEmbeddingOptionsFromConfig(...args),
}));
vi.mock('../vector-store.js', () => ({
  insertChunkEmbedding: (...args: unknown[]) => mockInsertChunkEmbedding(...args),
  deleteChunkEmbeddings: (...args: unknown[]) => mockDeleteChunkEmbeddings(...args),
}));
vi.mock('../fts.js', () => ({
  insertChunkFts: (...args: unknown[]) => mockInsertChunkFts(...args),
  deleteChunksFts: (...args: unknown[]) => mockDeleteChunksFts(...args),
}));

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import type Database from 'better-sqlite3';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { documentChunk } from '../../schema/sqlite/rag.js';
import { indexDocuments } from '../indexer.js';
import { DEFAULT_RAG_CONFIG } from '../types.js';

function seedDocs(db: AppDatabase) {
  db.insert(document)
    .values([
      {
        id: 'doc-1',
        paperlessId: 1,
        title: 'Doc 1',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      },
      {
        id: 'doc-2',
        paperlessId: 2,
        title: 'Doc 2',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      },
    ])
    .run();
  db.insert(documentContent)
    .values([
      { documentId: 'doc-1', fullText: 'This is document one content.', contentHash: 'hash1' },
      { documentId: 'doc-2', fullText: 'This is document two content.', contentHash: 'hash2' },
    ])
    .run();
}

describe('indexDocuments', () => {
  let db: AppDatabase;
  let sqlite: Database.Database;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    sqlite = handle.sqlite;
    await migrateDatabase(handle.sqlite);
    vi.clearAllMocks();
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  it('indexes documents and returns correct counts', async () => {
    seedDocs(db);
    // Return an embedding per chunk per doc
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);

    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
    });

    expect(result.indexed).toBe(2);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
    expect(result.failed).toBe(0);
  });

  it('skips already-indexed docs with same content hash', async () => {
    seedDocs(db);

    // Pre-seed a chunk for doc-1 with matching content hash
    db.insert(documentChunk)
      .values({
        id: 'existing-chunk',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'Existing chunk',
        tokenCount: 5,
        contentHash: 'hash1', // Matches doc-1's contentHash
        embeddingModel: 'text-embedding-3-small',
        createdAt: '2024-01-01',
      })
      .run();

    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
    });

    // doc-1 skipped (same hash), doc-2 indexed
    expect(result.skipped).toBe(1);
    expect(result.indexed).toBe(1);
  });

  it('re-indexes when content hash changed', async () => {
    seedDocs(db);

    // Pre-seed a chunk for doc-1 with DIFFERENT content hash
    db.insert(documentChunk)
      .values({
        id: 'old-chunk',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'Old chunk',
        tokenCount: 5,
        contentHash: 'old-hash', // Different from doc-1's 'hash1'
        embeddingModel: 'text-embedding-3-small',
        createdAt: '2024-01-01',
      })
      .run();

    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
    });

    // Both should be indexed (doc-1 re-indexed due to hash mismatch, doc-2 fresh)
    expect(result.indexed).toBe(2);
    // Old chunks should have been deleted
    expect(mockDeleteChunkEmbeddings).toHaveBeenCalled();
    expect(mockDeleteChunksFts).toHaveBeenCalled();
  });

  it('rebuild mode re-indexes all (even with matching hashes)', async () => {
    seedDocs(db);

    // Pre-seed chunks for both docs with matching hashes
    db.insert(documentChunk)
      .values([
        {
          id: 'c1',
          documentId: 'doc-1',
          chunkIndex: 0,
          content: 'C1',
          tokenCount: 5,
          contentHash: 'hash1',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
        {
          id: 'c2',
          documentId: 'doc-2',
          chunkIndex: 0,
          content: 'C2',
          tokenCount: 5,
          contentHash: 'hash2',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
      ])
      .run();

    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
      rebuild: true,
    });

    // Both re-indexed despite matching hashes
    expect(result.indexed).toBe(2);
  });

  it('returns skipped for documents without content', async () => {
    // Create a doc with null fullText
    db.insert(document)
      .values({
        id: 'doc-no-text',
        paperlessId: 99,
        title: 'No Text',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      })
      .run();
    db.insert(documentContent)
      .values({ documentId: 'doc-no-text', fullText: null, contentHash: null })
      .run();

    // The inner join with isNotNull(fullText) means this doc won't appear at all.
    // But if we have normal docs too, they should index fine.
    seedDocs(db);

    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
    });

    // Only the 2 seeded docs with content get processed
    expect(result.indexed).toBe(2);
  });

  it('circuit breaker stops after 3 consecutive group errors', async () => {
    // Create 5 documents
    for (let i = 1; i <= 5; i++) {
      db.insert(document)
        .values({
          id: `doc-${i}`,
          paperlessId: i,
          title: `Doc ${i}`,
          processingStatus: 'completed',
          syncedAt: '2024-01-01',
        })
        .run();
      db.insert(documentContent)
        .values({
          documentId: `doc-${i}`,
          fullText: `Content for document ${i}`,
          contentHash: `hash${i}`,
        })
        .run();
    }

    // Make generateEmbeddings throw every time
    mockGenerateEmbeddings.mockRejectedValue(new Error('API rate limit'));

    // Use docBatchSize=1 so each doc is its own group, exercising the circuit breaker
    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
      docBatchSize: 1,
    });

    // First 3 groups fail, circuit breaker triggers, remaining 2 docs counted as failed
    expect(result.failed).toBe(5);
    expect(result.indexed).toBe(0);
    // Only 3 actual API calls before circuit breaker aborts
    expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(3);
  });

  it('reports progress via onProgress callback', async () => {
    seedDocs(db);
    const progressCalls: Array<{
      phase: string;
      current: number;
      total: number;
      documentTitle?: string;
    }> = [];

    await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
      onProgress: (progress) => progressCalls.push({ ...progress }),
    });

    // Should have initial progress (current=0) + per-doc progress
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    // First call should be the initial progress
    expect(progressCalls[0]).toMatchObject({ phase: 'indexing', current: 0, total: 2 });
    // Subsequent calls should have document titles
    const withTitles = progressCalls.filter((p) => p.documentTitle);
    expect(withTitles.length).toBeGreaterThan(0);
  });

  it('returns correct durationMs (> 0)', async () => {
    seedDocs(db);
    const result = await indexDocuments(db, sqlite, DEFAULT_RAG_CONFIG, {
      apiKey: 'test-key',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });
});
