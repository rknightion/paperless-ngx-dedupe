import { eq, sql, desc, and } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import type { AppDatabase } from '../db/client.js';

export interface AiResultFilters {
  status?: string;
  search?: string;
}

export interface AiResultSummary {
  id: string;
  documentId: string;
  paperlessId: number;
  documentTitle: string;
  provider: string;
  model: string;
  suggestedCorrespondent: string | null;
  suggestedDocumentType: string | null;
  suggestedTags: string[];
  confidence: { correspondent: number; documentType: number; tags: number } | null;
  currentCorrespondent: string | null;
  currentDocumentType: string | null;
  currentTags: string[];
  appliedStatus: string;
  appliedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AiStats {
  totalProcessed: number;
  unprocessed: number;
  pendingReview: number;
  applied: number;
  rejected: number;
  failed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseConfidence(
  json: string | null,
): { correspondent: number; documentType: number; tags: number } | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getAiResults(
  db: AppDatabase,
  filters: AiResultFilters = {},
  limit = 20,
  offset = 0,
): { items: AiResultSummary[]; total: number } {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(aiProcessingResult.appliedStatus, filters.status));
  }
  if (filters.search) {
    conditions.push(sql`${document.title} LIKE ${'%' + filters.search + '%'}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .get();
  const total = totalResult?.count ?? 0;

  const rows = db
    .select({
      id: aiProcessingResult.id,
      documentId: aiProcessingResult.documentId,
      paperlessId: aiProcessingResult.paperlessId,
      documentTitle: document.title,
      provider: aiProcessingResult.provider,
      model: aiProcessingResult.model,
      suggestedCorrespondent: aiProcessingResult.suggestedCorrespondent,
      suggestedDocumentType: aiProcessingResult.suggestedDocumentType,
      suggestedTagsJson: aiProcessingResult.suggestedTagsJson,
      confidenceJson: aiProcessingResult.confidenceJson,
      currentCorrespondent: aiProcessingResult.currentCorrespondent,
      currentDocumentType: aiProcessingResult.currentDocumentType,
      currentTagsJson: aiProcessingResult.currentTagsJson,
      appliedStatus: aiProcessingResult.appliedStatus,
      appliedAt: aiProcessingResult.appliedAt,
      errorMessage: aiProcessingResult.errorMessage,
      createdAt: aiProcessingResult.createdAt,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .orderBy(desc(aiProcessingResult.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const items: AiResultSummary[] = rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    paperlessId: r.paperlessId,
    documentTitle: r.documentTitle,
    provider: r.provider,
    model: r.model,
    suggestedCorrespondent: r.suggestedCorrespondent,
    suggestedDocumentType: r.suggestedDocumentType,
    suggestedTags: parseJsonArray(r.suggestedTagsJson),
    confidence: parseConfidence(r.confidenceJson),
    currentCorrespondent: r.currentCorrespondent,
    currentDocumentType: r.currentDocumentType,
    currentTags: parseJsonArray(r.currentTagsJson),
    appliedStatus: r.appliedStatus ?? 'pending',
    appliedAt: r.appliedAt,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }));

  return { items, total };
}

export function getAiResult(db: AppDatabase, id: string): AiResultSummary | null {
  const row = db
    .select({
      id: aiProcessingResult.id,
      documentId: aiProcessingResult.documentId,
      paperlessId: aiProcessingResult.paperlessId,
      documentTitle: document.title,
      provider: aiProcessingResult.provider,
      model: aiProcessingResult.model,
      suggestedCorrespondent: aiProcessingResult.suggestedCorrespondent,
      suggestedDocumentType: aiProcessingResult.suggestedDocumentType,
      suggestedTagsJson: aiProcessingResult.suggestedTagsJson,
      confidenceJson: aiProcessingResult.confidenceJson,
      currentCorrespondent: aiProcessingResult.currentCorrespondent,
      currentDocumentType: aiProcessingResult.currentDocumentType,
      currentTagsJson: aiProcessingResult.currentTagsJson,
      appliedStatus: aiProcessingResult.appliedStatus,
      appliedAt: aiProcessingResult.appliedAt,
      appliedFieldsJson: aiProcessingResult.appliedFieldsJson,
      errorMessage: aiProcessingResult.errorMessage,
      promptTokens: aiProcessingResult.promptTokens,
      completionTokens: aiProcessingResult.completionTokens,
      processingTimeMs: aiProcessingResult.processingTimeMs,
      createdAt: aiProcessingResult.createdAt,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(eq(aiProcessingResult.id, id))
    .get();

  if (!row) return null;

  return {
    id: row.id,
    documentId: row.documentId,
    paperlessId: row.paperlessId,
    documentTitle: row.documentTitle,
    provider: row.provider,
    model: row.model,
    suggestedCorrespondent: row.suggestedCorrespondent,
    suggestedDocumentType: row.suggestedDocumentType,
    suggestedTags: parseJsonArray(row.suggestedTagsJson),
    confidence: parseConfidence(row.confidenceJson),
    currentCorrespondent: row.currentCorrespondent,
    currentDocumentType: row.currentDocumentType,
    currentTags: parseJsonArray(row.currentTagsJson),
    appliedStatus: row.appliedStatus ?? 'pending',
    appliedAt: row.appliedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

export function getAiStats(db: AppDatabase): AiStats {
  const rows = db
    .select({
      appliedStatus: aiProcessingResult.appliedStatus,
      count: sql<number>`count(*)`,
      promptTokens: sql<number>`coalesce(sum(${aiProcessingResult.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${aiProcessingResult.completionTokens}), 0)`,
    })
    .from(aiProcessingResult)
    .groupBy(aiProcessingResult.appliedStatus)
    .all();

  const failed = db
    .select({ count: sql<number>`count(*)` })
    .from(aiProcessingResult)
    .where(sql`${aiProcessingResult.errorMessage} IS NOT NULL`)
    .get();

  const totalDocs = db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .get();

  const processedDocs = db
    .select({ count: sql<number>`count(distinct ${aiProcessingResult.documentId})` })
    .from(aiProcessingResult)
    .get();

  const stats: AiStats = {
    totalProcessed: 0,
    unprocessed: (totalDocs?.count ?? 0) - (processedDocs?.count ?? 0),
    pendingReview: 0,
    applied: 0,
    rejected: 0,
    failed: failed?.count ?? 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  };

  for (const row of rows) {
    stats.totalProcessed += row.count;
    stats.totalPromptTokens += row.promptTokens;
    stats.totalCompletionTokens += row.completionTokens;

    switch (row.appliedStatus) {
      case 'pending':
        stats.pendingReview += row.count;
        break;
      case 'applied':
        stats.applied += row.count;
        break;
      case 'rejected':
        stats.rejected += row.count;
        break;
      case 'partial':
        stats.applied += row.count;
        break;
    }
  }

  return stats;
}

export function markAiResultApplied(db: AppDatabase, id: string, appliedFields: string[]): void {
  const allFields = ['correspondent', 'documentType', 'tags'];
  const status = appliedFields.length === allFields.length ? 'applied' : 'partial';

  db.update(aiProcessingResult)
    .set({
      appliedStatus: status,
      appliedAt: new Date().toISOString(),
      appliedFieldsJson: JSON.stringify(appliedFields),
    })
    .where(eq(aiProcessingResult.id, id))
    .run();
}

export function markAiResultRejected(db: AppDatabase, id: string): void {
  db.update(aiProcessingResult)
    .set({
      appliedStatus: 'rejected',
      appliedAt: new Date().toISOString(),
    })
    .where(eq(aiProcessingResult.id, id))
    .run();
}

export function batchMarkApplied(db: AppDatabase, ids: string[], appliedFields: string[]): void {
  const allFields = ['correspondent', 'documentType', 'tags'];
  const status = appliedFields.length === allFields.length ? 'applied' : 'partial';
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const id of ids) {
      tx.update(aiProcessingResult)
        .set({
          appliedStatus: status,
          appliedAt: now,
          appliedFieldsJson: JSON.stringify(appliedFields),
        })
        .where(eq(aiProcessingResult.id, id))
        .run();
    }
  });
}

export function batchMarkRejected(db: AppDatabase, ids: string[]): void {
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const id of ids) {
      tx.update(aiProcessingResult)
        .set({ appliedStatus: 'rejected', appliedAt: now })
        .where(eq(aiProcessingResult.id, id))
        .run();
    }
  });
}
