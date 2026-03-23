import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3])),
  embeddingOptionsFromConfig: vi
    .fn()
    .mockReturnValue({ apiKey: 'test', model: 'test', dimensions: 3 }),
}));
vi.mock('../vector-store.js', () => ({
  searchVectors: vi.fn().mockReturnValue([
    { chunkId: 'chunk-1', distance: 0.1 },
    { chunkId: 'chunk-2', distance: 0.3 },
  ]),
}));
vi.mock('../fts.js', () => ({
  searchFts: vi.fn().mockReturnValue([
    { chunkId: 'chunk-1', rank: -5.0 },
    { chunkId: 'chunk-3', rank: -3.0 },
  ]),
}));

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import type Database from 'better-sqlite3';
import { document } from '../../schema/sqlite/documents.js';
import { documentChunk } from '../../schema/sqlite/rag.js';
import { hybridSearch } from '../search.js';
import { DEFAULT_RAG_CONFIG } from '../types.js';
import { searchVectors } from '../vector-store.js';
import { searchFts } from '../fts.js';

describe('hybridSearch', () => {
  let db: AppDatabase;
  let sqlite: Database.Database;
  const config = { ...DEFAULT_RAG_CONFIG, topK: 5 };

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    sqlite = handle.sqlite;
    await migrateDatabase(handle.sqlite);

    // Seed documents
    db.insert(document)
      .values([
        {
          id: 'doc-1',
          paperlessId: 1,
          title: 'Invoice from ACME',
          correspondent: 'ACME Corp',
          processingStatus: 'completed',
          syncedAt: '2024-01-01',
        },
        {
          id: 'doc-2',
          paperlessId: 2,
          title: 'Receipt',
          correspondent: null,
          processingStatus: 'completed',
          syncedAt: '2024-01-01',
        },
      ])
      .run();

    // Seed chunks matching the mock IDs
    db.insert(documentChunk)
      .values([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          chunkIndex: 0,
          content: 'Invoice content from ACME',
          tokenCount: 10,
          contentHash: 'h1',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
        {
          id: 'chunk-2',
          documentId: 'doc-1',
          chunkIndex: 1,
          content: 'More invoice details',
          tokenCount: 10,
          contentHash: 'h2',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
        {
          id: 'chunk-3',
          documentId: 'doc-2',
          chunkIndex: 0,
          content: 'Receipt for purchase',
          tokenCount: 10,
          contentHash: 'h3',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
      ])
      .run();

    vi.clearAllMocks();

    // Re-set mock return values after clearAllMocks
    vi.mocked(searchVectors).mockReturnValue([
      { chunkId: 'chunk-1', distance: 0.1 },
      { chunkId: 'chunk-2', distance: 0.3 },
    ]);
    vi.mocked(searchFts).mockReturnValue([
      { chunkId: 'chunk-1', rank: -5.0 },
      { chunkId: 'chunk-3', rank: -3.0 },
    ]);
  });

  it('returns fused results combining vector and FTS results', async () => {
    const results = await hybridSearch(sqlite, db, 'invoice', config, 'test-key');
    expect(results.length).toBeGreaterThan(0);

    // All three chunk IDs should appear
    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('chunk-1');
    expect(ids).toContain('chunk-2');
    expect(ids).toContain('chunk-3');
  });

  it('chunk-1 appears in both → highest score (RRF fusion)', async () => {
    const results = await hybridSearch(sqlite, db, 'invoice', config, 'test-key');
    // chunk-1 is in both vector and FTS results → should have highest RRF score
    expect(results[0].chunkId).toBe('chunk-1');
  });

  it('hydrates results with document title and correspondent', async () => {
    const results = await hybridSearch(sqlite, db, 'invoice', config, 'test-key');

    const chunk1 = results.find((r) => r.chunkId === 'chunk-1');
    expect(chunk1).toBeDefined();
    expect(chunk1!.documentTitle).toBe('Invoice from ACME');
    expect(chunk1!.correspondent).toBe('ACME Corp');

    const chunk3 = results.find((r) => r.chunkId === 'chunk-3');
    expect(chunk3).toBeDefined();
    expect(chunk3!.documentTitle).toBe('Receipt');
    expect(chunk3!.correspondent).toBeNull();
  });

  it('returns empty when both searches return nothing', async () => {
    vi.mocked(searchVectors).mockReturnValue([]);
    vi.mocked(searchFts).mockReturnValue([]);

    const results = await hybridSearch(sqlite, db, 'nothing', config, 'test-key');
    expect(results).toHaveLength(0);
  });

  it('limits by config.topK', async () => {
    // Set topK to 2 and provide more results
    const smallConfig = { ...DEFAULT_RAG_CONFIG, topK: 2 };

    const results = await hybridSearch(sqlite, db, 'invoice', smallConfig, 'test-key');
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('results sorted by fused score descending', async () => {
    const results = await hybridSearch(sqlite, db, 'invoice', config, 'test-key');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
