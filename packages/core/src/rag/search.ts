import { inArray } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import { document } from '../schema/sqlite/documents.js';
import { documentChunk } from '../schema/sqlite/rag.js';
import { generateEmbedding, embeddingOptionsFromConfig } from './embeddings.js';
import { searchVectors } from './vector-store.js';
import { searchFts } from './fts.js';
import type { RagConfig, SearchResult } from './types.js';

interface RankedItem {
  chunkId: string;
  score: number;
}

function reciprocalRankFusion(...resultSets: { chunkId: string }[][]): RankedItem[] {
  const k = 60;
  const scores = new Map<string, number>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const id = results[rank].chunkId;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }

  return Array.from(scores.entries())
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((a, b) => b.score - a.score);
}

export async function hybridSearch(
  sqlite: Database.Database,
  db: AppDatabase,
  query: string,
  config: RagConfig,
  apiKey: string,
): Promise<SearchResult[]> {
  const embeddingOpts = embeddingOptionsFromConfig(config, apiKey);

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query, embeddingOpts);

  // Run vector search and FTS search in parallel
  const retrieveCount = Math.max(config.topK * 5, 50);
  const vecResults = searchVectors(sqlite, queryEmbedding, retrieveCount);
  const ftsResults = searchFts(sqlite, query, retrieveCount);

  // Fuse results with RRF
  const fused = reciprocalRankFusion(vecResults, ftsResults);
  const topIds = fused.slice(0, config.topK).map((r) => r.chunkId);

  if (topIds.length === 0) return [];

  // Hydrate with chunk content and document metadata
  const scoreMap = new Map(fused.map((r) => [r.chunkId, r.score]));

  const chunks = db
    .select({
      chunkId: documentChunk.id,
      documentId: documentChunk.documentId,
      content: documentChunk.content,
      chunkIndex: documentChunk.chunkIndex,
    })
    .from(documentChunk)
    .where(inArray(documentChunk.id, topIds))
    .all();

  // Get document metadata
  const docIds = [...new Set(chunks.map((c) => c.documentId))];
  const docs = db
    .select({
      id: document.id,
      title: document.title,
      correspondent: document.correspondent,
    })
    .from(document)
    .where(inArray(document.id, docIds))
    .all();

  const docMap = new Map(docs.map((d) => [d.id, d]));

  const results: SearchResult[] = chunks.map((chunk) => {
    const doc = docMap.get(chunk.documentId);
    return {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentTitle: doc?.title ?? 'Unknown',
      correspondent: doc?.correspondent ?? null,
      chunkContent: chunk.content,
      chunkIndex: chunk.chunkIndex,
      score: scoreMap.get(chunk.chunkId) ?? 0,
    };
  });

  // Sort by score (RRF order)
  results.sort((a, b) => b.score - a.score);
  return results;
}
