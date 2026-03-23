import { count, sql, max } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { documentContent } from '../schema/sqlite/documents.js';
import { documentChunk, ragConversation, ragMessage } from '../schema/sqlite/rag.js';
import { OPENAI_EMBEDDING_MODELS } from './types.js';
import type { RagStats, CostEstimate } from './types.js';
import { getRagConfig } from './config.js';

function computeCost(totalChars: number, embeddingModel: string): CostEstimate | null {
  if (totalChars === 0) return null;
  const estimatedTokens = Math.ceil(totalChars / 4);
  const modelDef = OPENAI_EMBEDDING_MODELS.find((m) => m.id === embeddingModel);
  const costPer1M = modelDef?.costPer1MTokens ?? 0.02;
  return {
    totalCharacters: totalChars,
    estimatedTokens,
    estimatedCostUsd: (estimatedTokens / 1_000_000) * costPer1M,
    embeddingModel,
  };
}

export function getRagStats(db: AppDatabase): RagStats {
  // Count unique indexed documents
  const indexedResult = db
    .select({
      count: sql<number>`COUNT(DISTINCT ${documentChunk.documentId})`,
    })
    .from(documentChunk)
    .get();

  // Count total documents with content
  const totalDocsResult = db.select({ count: count() }).from(documentContent).get();

  // Count total chunks
  const chunksResult = db.select({ count: count() }).from(documentChunk).get();

  // Get last indexed timestamp
  const lastIndexed = db
    .select({ maxDate: max(documentChunk.createdAt) })
    .from(documentChunk)
    .get();

  // Get embedding model from the most recent chunk
  const latestChunk = db
    .select({ embeddingModel: documentChunk.embeddingModel })
    .from(documentChunk)
    .orderBy(sql`${documentChunk.createdAt} DESC`)
    .limit(1)
    .get();

  // Conversation stats
  const convResult = db.select({ count: count() }).from(ragConversation).get();
  const msgResult = db.select({ count: count() }).from(ragMessage).get();

  // Cost estimation: characters of unindexed documents
  const unindexedChars = db
    .select({
      total: sql<number>`COALESCE(SUM(LENGTH(${documentContent.fullText})), 0)`,
    })
    .from(documentContent)
    .where(
      sql`${documentContent.documentId} NOT IN (SELECT DISTINCT ${documentChunk.documentId} FROM ${documentChunk}) AND ${documentContent.fullText} IS NOT NULL`,
    )
    .get();

  // Cost estimation: characters of ALL documents (for rebuild)
  const allChars = db
    .select({
      total: sql<number>`COALESCE(SUM(LENGTH(${documentContent.fullText})), 0)`,
    })
    .from(documentContent)
    .where(sql`${documentContent.fullText} IS NOT NULL`)
    .get();

  const indexedCount = indexedResult?.count ?? 0;
  const totalDocs = totalDocsResult?.count ?? 0;
  const config = getRagConfig(db);
  const model = latestChunk?.embeddingModel ?? config.embeddingModel;

  return {
    totalChunks: chunksResult?.count ?? 0,
    indexedDocuments: indexedCount,
    unindexedDocuments: Math.max(0, totalDocs - indexedCount),
    embeddingModel: model,
    lastIndexedAt: lastIndexed?.maxDate ?? null,
    totalConversations: convResult?.count ?? 0,
    totalMessages: msgResult?.count ?? 0,
    indexCost: computeCost(unindexedChars?.total ?? 0, config.embeddingModel),
    rebuildCost: computeCost(allChars?.total ?? 0, config.embeddingModel),
  };
}
