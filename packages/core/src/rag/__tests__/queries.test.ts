import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { documentChunk, ragConversation, ragMessage } from '../../schema/sqlite/rag.js';
import { getRagStats } from '../queries.js';

describe('getRagStats', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns zero stats for fresh DB', () => {
    const stats = getRagStats(db);
    expect(stats.totalChunks).toBe(0);
    expect(stats.indexedDocuments).toBe(0);
    expect(stats.unindexedDocuments).toBe(0);
    expect(stats.totalConversations).toBe(0);
    expect(stats.totalMessages).toBe(0);
    expect(stats.lastIndexedAt).toBeNull();
    expect(stats.indexCost).toBeNull();
    expect(stats.rebuildCost).toBeNull();
  });

  it('counts indexed documents correctly (DISTINCT documentId)', () => {
    // Seed a document with content and chunks
    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Doc 1',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      })
      .run();
    db.insert(documentContent)
      .values({ documentId: 'doc-1', fullText: 'Some text', contentHash: 'hash1' })
      .run();
    // Two chunks for same document
    db.insert(documentChunk)
      .values({
        id: 'c1',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'Chunk 1',
        tokenCount: 10,
        contentHash: 'hash1',
        embeddingModel: 'text-embedding-3-small',
        createdAt: '2024-01-01',
      })
      .run();
    db.insert(documentChunk)
      .values({
        id: 'c2',
        documentId: 'doc-1',
        chunkIndex: 1,
        content: 'Chunk 2',
        tokenCount: 10,
        contentHash: 'hash1',
        embeddingModel: 'text-embedding-3-small',
        createdAt: '2024-01-01',
      })
      .run();

    const stats = getRagStats(db);
    expect(stats.indexedDocuments).toBe(1); // Only 1 distinct document
    expect(stats.totalChunks).toBe(2);
  });

  it('counts total chunks', () => {
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
        { documentId: 'doc-1', fullText: 'Text 1', contentHash: 'h1' },
        { documentId: 'doc-2', fullText: 'Text 2', contentHash: 'h2' },
      ])
      .run();
    db.insert(documentChunk)
      .values([
        {
          id: 'c1',
          documentId: 'doc-1',
          chunkIndex: 0,
          content: 'A',
          tokenCount: 5,
          contentHash: 'h1',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
        {
          id: 'c2',
          documentId: 'doc-2',
          chunkIndex: 0,
          content: 'B',
          tokenCount: 5,
          contentHash: 'h2',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
        {
          id: 'c3',
          documentId: 'doc-2',
          chunkIndex: 1,
          content: 'C',
          tokenCount: 5,
          contentHash: 'h2',
          embeddingModel: 'test',
          createdAt: '2024-01-01',
        },
      ])
      .run();

    const stats = getRagStats(db);
    expect(stats.totalChunks).toBe(3);
    expect(stats.indexedDocuments).toBe(2);
  });

  it('calculates unindexed documents', () => {
    db.insert(document)
      .values([
        {
          id: 'doc-1',
          paperlessId: 1,
          title: 'Indexed',
          processingStatus: 'completed',
          syncedAt: '2024-01-01',
        },
        {
          id: 'doc-2',
          paperlessId: 2,
          title: 'Not indexed',
          processingStatus: 'completed',
          syncedAt: '2024-01-01',
        },
      ])
      .run();
    db.insert(documentContent)
      .values([
        { documentId: 'doc-1', fullText: 'Text 1', contentHash: 'h1' },
        { documentId: 'doc-2', fullText: 'Text 2', contentHash: 'h2' },
      ])
      .run();
    // Only doc-1 has chunks
    db.insert(documentChunk)
      .values({
        id: 'c1',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'A',
        tokenCount: 5,
        contentHash: 'h1',
        embeddingModel: 'test',
        createdAt: '2024-01-01',
      })
      .run();

    const stats = getRagStats(db);
    expect(stats.unindexedDocuments).toBe(1);
  });

  it('computes cost estimates', () => {
    // Create a document with content but no chunks (unindexed)
    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Doc',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      })
      .run();
    const text = 'A'.repeat(4000); // 4000 chars → 1000 tokens
    db.insert(documentContent)
      .values({ documentId: 'doc-1', fullText: text, contentHash: 'h1' })
      .run();

    const stats = getRagStats(db);
    expect(stats.indexCost).not.toBeNull();
    expect(stats.indexCost!.totalCharacters).toBe(4000);
    expect(stats.indexCost!.estimatedTokens).toBe(1000);
    // text-embedding-3-small costs $0.02 per 1M tokens
    expect(stats.indexCost!.estimatedCostUsd).toBeCloseTo((1000 / 1_000_000) * 0.02, 8);
    expect(stats.indexCost!.embeddingModel).toBe('text-embedding-3-small');
  });

  it('counts conversations and messages', () => {
    const now = new Date().toISOString();
    db.insert(ragConversation)
      .values([
        { id: 'conv-1', title: 'Chat 1', createdAt: now, updatedAt: now },
        { id: 'conv-2', title: 'Chat 2', createdAt: now, updatedAt: now },
      ])
      .run();
    db.insert(ragMessage)
      .values([
        { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hi', createdAt: now },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Hello',
          createdAt: now,
        },
        {
          id: 'msg-3',
          conversationId: 'conv-2',
          role: 'user',
          content: 'Question',
          createdAt: now,
        },
      ])
      .run();

    const stats = getRagStats(db);
    expect(stats.totalConversations).toBe(2);
    expect(stats.totalMessages).toBe(3);
  });

  it('returns correct embedding model from config', () => {
    const stats = getRagStats(db);
    // Default model when no chunks exist
    expect(stats.embeddingModel).toBe('text-embedding-3-small');
  });

  it('returns embedding model from latest chunk when chunks exist', () => {
    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Doc',
        processingStatus: 'completed',
        syncedAt: '2024-01-01',
      })
      .run();
    db.insert(documentContent)
      .values({ documentId: 'doc-1', fullText: 'text', contentHash: 'h1' })
      .run();
    db.insert(documentChunk)
      .values({
        id: 'c1',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'A',
        tokenCount: 5,
        contentHash: 'h1',
        embeddingModel: 'text-embedding-3-large',
        createdAt: '2024-01-01',
      })
      .run();

    const stats = getRagStats(db);
    expect(stats.embeddingModel).toBe('text-embedding-3-large');
  });
});
