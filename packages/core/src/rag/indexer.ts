import { eq, isNotNull } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { documentChunk } from '../schema/sqlite/rag.js';
import { chunkDocument } from './chunker.js';
import { generateEmbeddings, embeddingOptionsFromConfig } from './embeddings.js';
import { insertChunkEmbedding, deleteChunkEmbeddings } from './vector-store.js';
import { insertChunkFts, deleteChunksFts } from './fts.js';
import type { RagConfig } from './types.js';

export interface IndexProgress {
  phase: string;
  current: number;
  total: number;
  documentTitle?: string;
}

export interface IndexResult {
  indexed: number;
  skipped: number;
  failed: number;
  totalChunks: number;
  durationMs: number;
}

export interface IndexOptions {
  apiKey: string;
  rebuild?: boolean;
  onProgress?: (progress: IndexProgress) => void;
}

export async function indexDocuments(
  db: AppDatabase,
  sqlite: Database.Database,
  config: RagConfig,
  opts: IndexOptions,
): Promise<IndexResult> {
  const start = performance.now();
  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let totalChunks = 0;
  let consecutiveErrors = 0;

  // If rebuild, clear all existing chunks
  if (opts.rebuild) {
    const existingChunks = db.select({ id: documentChunk.id }).from(documentChunk).all();
    const chunkIds = existingChunks.map((c) => c.id);
    if (chunkIds.length > 0) {
      deleteChunkEmbeddings(sqlite, chunkIds);
      deleteChunksFts(sqlite, chunkIds);
      db.delete(documentChunk).run();
    }
  }

  // Get all documents with content
  const docs = db
    .select({
      id: document.id,
      title: document.title,
      correspondent: document.correspondent,
      fullText: documentContent.fullText,
      contentHash: documentContent.contentHash,
    })
    .from(document)
    .innerJoin(documentContent, eq(document.id, documentContent.documentId))
    .where(isNotNull(documentContent.fullText))
    .all();

  const totalDocs = docs.length;
  opts.onProgress?.({ phase: 'indexing', current: 0, total: totalDocs });

  const embeddingOpts = embeddingOptionsFromConfig(config, opts.apiKey);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (!doc.fullText) {
      skipped++;
      continue;
    }

    // Circuit breaker
    if (consecutiveErrors >= 3) {
      failed += docs.length - i;
      break;
    }

    opts.onProgress?.({
      phase: 'indexing',
      current: i + 1,
      total: totalDocs,
      documentTitle: doc.title,
    });

    // Check if already indexed with same content
    if (!opts.rebuild) {
      const existing = db
        .select({ contentHash: documentChunk.contentHash })
        .from(documentChunk)
        .where(eq(documentChunk.documentId, doc.id))
        .limit(1)
        .all();

      if (existing.length > 0 && existing[0].contentHash === doc.contentHash) {
        skipped++;
        continue;
      }

      // Content changed — delete old chunks
      if (existing.length > 0) {
        const oldChunks = db
          .select({ id: documentChunk.id })
          .from(documentChunk)
          .where(eq(documentChunk.documentId, doc.id))
          .all();
        const oldIds = oldChunks.map((c) => c.id);
        if (oldIds.length > 0) {
          deleteChunkEmbeddings(sqlite, oldIds);
          deleteChunksFts(sqlite, oldIds);
          db.delete(documentChunk).where(eq(documentChunk.documentId, doc.id)).run();
        }
      }
    }

    try {
      // Chunk the document
      const chunks = chunkDocument(
        doc.fullText,
        { title: doc.title, correspondent: doc.correspondent },
        { chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap },
      );

      if (chunks.length === 0) {
        skipped++;
        continue;
      }

      // Generate embeddings for all chunks
      const texts = chunks.map((c) => c.content);
      const embeddings = await generateEmbeddings(texts, embeddingOpts);

      // Insert chunks, vectors, and FTS entries in a transaction
      const now = new Date().toISOString();
      const insertedIds: string[] = [];

      db.transaction((tx) => {
        for (let j = 0; j < chunks.length; j++) {
          const chunk = chunks[j];
          const result = tx
            .insert(documentChunk)
            .values({
              documentId: doc.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              tokenCount: chunk.tokenCount,
              contentHash: doc.contentHash ?? chunk.contentHash,
              embeddingModel: config.embeddingModel,
              createdAt: now,
            })
            .returning({ id: documentChunk.id })
            .get();
          insertedIds.push(result.id);
        }
      });

      // Insert into virtual tables (outside Drizzle transaction)
      for (let j = 0; j < insertedIds.length; j++) {
        const chunkId = insertedIds[j];
        const embedding = new Float32Array(embeddings[j]);
        insertChunkEmbedding(sqlite, chunkId, embedding);
        insertChunkFts(sqlite, chunkId, chunks[j].content);
      }

      totalChunks += chunks.length;
      indexed++;
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors++;
      failed++;
      // Continue to next document
    }
  }

  return {
    indexed,
    skipped,
    failed,
    totalChunks,
    durationMs: Math.round(performance.now() - start),
  };
}
