import { eq, isNotNull } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { documentChunk } from '../schema/sqlite/rag.js';
import { chunkDocument } from './chunker.js';
import { generateEmbeddings, embeddingOptionsFromConfig } from './embeddings.js';
import { insertChunkEmbedding, deleteChunkEmbeddings } from './vector-store.js';
import { insertChunkFts, deleteChunksFts } from './fts.js';
import type { Chunk, RagConfig } from './types.js';

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
  /** Override the number of documents processed per group. Defaults to 50. Exposed for testing. */
  docBatchSize?: number;
}

interface DocWork {
  doc: {
    id: string;
    title: string;
    correspondent: string | null;
    fullText: string | null;
    contentHash: string | null;
  };
  chunks: Chunk[];
  oldChunkIds: string[];
}

const DOC_BATCH_SIZE = 50;

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
  const docBatchSize = opts.docBatchSize ?? DOC_BATCH_SIZE;

  // Phase 1: evaluate all docs — check hashes, chunk, collect work items
  const toIndex: DocWork[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];

    opts.onProgress?.({
      phase: 'indexing',
      current: i + 1,
      total: totalDocs,
      documentTitle: doc.title,
    });

    if (!doc.fullText) {
      skipped++;
      continue;
    }

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

      // Content changed — collect old chunk IDs for deletion
      if (existing.length > 0) {
        const oldChunks = db
          .select({ id: documentChunk.id })
          .from(documentChunk)
          .where(eq(documentChunk.documentId, doc.id))
          .all();
        const chunks = chunkDocument(
          doc.fullText,
          { title: doc.title, correspondent: doc.correspondent },
          { chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap },
        );
        if (chunks.length === 0) {
          skipped++;
          continue;
        }
        toIndex.push({ doc, chunks, oldChunkIds: oldChunks.map((c) => c.id) });
        continue;
      }
    }

    const chunks = chunkDocument(
      doc.fullText,
      { title: doc.title, correspondent: doc.correspondent },
      { chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap },
    );

    if (chunks.length === 0) {
      skipped++;
      continue;
    }

    toIndex.push({ doc, chunks, oldChunkIds: [] });
  }

  // Phase 2: process in groups — embed concurrently across docs, write to DB after each group
  let consecutiveGroupErrors = 0;

  for (let g = 0; g < toIndex.length; g += docBatchSize) {
    if (consecutiveGroupErrors >= 3) {
      failed += toIndex.length - g;
      break;
    }

    const group = toIndex.slice(g, g + docBatchSize);
    const allTexts = group.flatMap((d) => d.chunks.map((c) => c.content));

    let allEmbeddings: number[][];
    try {
      allEmbeddings = await generateEmbeddings(allTexts, embeddingOpts, config.concurrentBatches);
      consecutiveGroupErrors = 0;
    } catch {
      failed += group.length;
      consecutiveGroupErrors++;
      continue;
    }

    // Distribute embeddings back to each doc and write to DB
    let offset = 0;
    for (const item of group) {
      const embeddings = allEmbeddings.slice(offset, offset + item.chunks.length);
      offset += item.chunks.length;

      try {
        // Delete old chunks if this doc had changed content
        if (item.oldChunkIds.length > 0) {
          deleteChunkEmbeddings(sqlite, item.oldChunkIds);
          deleteChunksFts(sqlite, item.oldChunkIds);
          db.delete(documentChunk).where(eq(documentChunk.documentId, item.doc.id)).run();
        }

        const now = new Date().toISOString();
        const insertedIds: string[] = [];

        db.transaction((tx) => {
          for (let j = 0; j < item.chunks.length; j++) {
            const chunk = item.chunks[j];
            const result = tx
              .insert(documentChunk)
              .values({
                documentId: item.doc.id,
                chunkIndex: chunk.chunkIndex,
                content: chunk.content,
                tokenCount: chunk.tokenCount,
                contentHash: item.doc.contentHash ?? chunk.contentHash,
                embeddingModel: config.embeddingModel,
                createdAt: now,
              })
              .returning({ id: documentChunk.id })
              .get();
            insertedIds.push(result.id);
          }
        });

        for (let j = 0; j < insertedIds.length; j++) {
          const chunkId = insertedIds[j];
          const embedding = new Float32Array(embeddings[j]);
          insertChunkEmbedding(sqlite, chunkId, embedding);
          insertChunkFts(sqlite, chunkId, item.chunks[j].content);
        }

        totalChunks += item.chunks.length;
        indexed++;
      } catch {
        failed++;
      }
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
