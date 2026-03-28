import { eq, sql, desc, asc, and, isNull, isNotNull, like } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import type { AppDatabase } from '../db/client.js';

export interface ApplySnapshot {
  preApply: {
    correspondentId?: number | null;
    correspondentName?: string | null;
    documentTypeId?: number | null;
    documentTypeName?: string | null;
    tagIds?: number[] | null;
    tagNames?: string[] | null;
  };
  applied: {
    correspondentId?: number | null;
    documentTypeId?: number | null;
    tagIds?: number[] | null;
  };
}

export interface AiResultFilters {
  status?: string;
  search?: string;
  sort?:
    | 'newest'
    | 'oldest'
    | 'confidence_asc'
    | 'confidence_desc'
    | 'applied_newest'
    | 'applied_oldest';
  changedOnly?: boolean;
  failed?: boolean;
  minConfidence?: number;
  maxConfidence?: number;
  provider?: string;
  model?: string;
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
  failureType: string | null;
  createdAt: string;
}

export interface AiResultDetail extends AiResultSummary {
  evidence: string | null;
  failureType: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  processingTimeMs: number | null;
  appliedFields: string[] | null;
  rawResponseJson: string | null;
  preApplyCorrespondentId: number | null;
  preApplyCorrespondentName: string | null;
  preApplyDocumentTypeId: number | null;
  preApplyDocumentTypeName: string | null;
  preApplyTagIds: number[] | null;
  preApplyTagNames: string[] | null;
  appliedCorrespondentId: number | null;
  appliedDocumentTypeId: number | null;
  appliedTagIds: number[] | null;
  revertedAt: string | null;
}

export interface AiStats {
  totalProcessed: number;
  unprocessed: number;
  pendingReview: number;
  applied: number;
  rejected: number;
  reverted: number;
  failed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEstimatedCostUsd: number;
}

export interface UnprocessedDocument {
  id: string;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
}

export interface UnprocessedDocumentFilters {
  search?: string;
  correspondent?: string;
  documentType?: string;
  tag?: string;
  sort?: 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'random';
  seed?: number;
}

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseJsonNumberArray(json: string | null): number[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
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
  if (filters.failed === true) {
    conditions.push(eq(aiProcessingResult.appliedStatus, 'failed'));
  }
  if (filters.minConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= ${filters.minConfidence}`,
    );
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 <= ${filters.maxConfidence}`,
    );
  }
  if (filters.provider) {
    conditions.push(eq(aiProcessingResult.provider, filters.provider));
  }
  if (filters.model) {
    conditions.push(eq(aiProcessingResult.model, filters.model));
  }
  if (filters.changedOnly) {
    conditions.push(
      sql`(${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderByClause;
  switch (filters.sort) {
    case 'oldest':
      orderByClause = asc(aiProcessingResult.createdAt);
      break;
    case 'confidence_asc':
      orderByClause = sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 asc`;
      break;
    case 'confidence_desc':
      orderByClause = sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 desc`;
      break;
    case 'applied_newest':
      orderByClause = desc(aiProcessingResult.appliedAt);
      break;
    case 'applied_oldest':
      orderByClause = asc(aiProcessingResult.appliedAt);
      break;
    default: // 'newest' or undefined
      orderByClause = desc(aiProcessingResult.createdAt);
      break;
  }

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
      failureType: aiProcessingResult.failureType,
      createdAt: aiProcessingResult.createdAt,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .orderBy(orderByClause)
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
    appliedStatus: r.appliedStatus ?? 'pending_review',
    appliedAt: r.appliedAt,
    errorMessage: r.errorMessage,
    failureType: r.failureType ?? null,
    createdAt: r.createdAt,
  }));

  return { items, total };
}

export function getAiResult(db: AppDatabase, id: string): AiResultDetail | null {
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
      evidence: aiProcessingResult.evidence,
      failureType: aiProcessingResult.failureType,
      rawResponseJson: aiProcessingResult.rawResponseJson,
      promptTokens: aiProcessingResult.promptTokens,
      completionTokens: aiProcessingResult.completionTokens,
      processingTimeMs: aiProcessingResult.processingTimeMs,
      createdAt: aiProcessingResult.createdAt,
      preApplyCorrespondentId: aiProcessingResult.preApplyCorrespondentId,
      preApplyCorrespondentName: aiProcessingResult.preApplyCorrespondentName,
      preApplyDocumentTypeId: aiProcessingResult.preApplyDocumentTypeId,
      preApplyDocumentTypeName: aiProcessingResult.preApplyDocumentTypeName,
      preApplyTagIdsJson: aiProcessingResult.preApplyTagIdsJson,
      preApplyTagNamesJson: aiProcessingResult.preApplyTagNamesJson,
      appliedCorrespondentId: aiProcessingResult.appliedCorrespondentId,
      appliedDocumentTypeId: aiProcessingResult.appliedDocumentTypeId,
      appliedTagIdsJson: aiProcessingResult.appliedTagIdsJson,
      revertedAt: aiProcessingResult.revertedAt,
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
    appliedStatus: row.appliedStatus ?? 'pending_review',
    appliedAt: row.appliedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    evidence: row.evidence ?? null,
    failureType: row.failureType ?? null,
    promptTokens: row.promptTokens ?? null,
    completionTokens: row.completionTokens ?? null,
    processingTimeMs: row.processingTimeMs ?? null,
    appliedFields: row.appliedFieldsJson ? JSON.parse(row.appliedFieldsJson) : null,
    rawResponseJson: row.rawResponseJson ?? null,
    preApplyCorrespondentId: row.preApplyCorrespondentId ?? null,
    preApplyCorrespondentName: row.preApplyCorrespondentName ?? null,
    preApplyDocumentTypeId: row.preApplyDocumentTypeId ?? null,
    preApplyDocumentTypeName: row.preApplyDocumentTypeName ?? null,
    preApplyTagIds: parseJsonNumberArray(row.preApplyTagIdsJson),
    preApplyTagNames: parseJsonArray(row.preApplyTagNamesJson),
    appliedCorrespondentId: row.appliedCorrespondentId ?? null,
    appliedDocumentTypeId: row.appliedDocumentTypeId ?? null,
    appliedTagIds: parseJsonNumberArray(row.appliedTagIdsJson),
    revertedAt: row.revertedAt ?? null,
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

  const totalDocs = db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .get();

  const processedDocs = db
    .select({ count: sql<number>`count(distinct ${aiProcessingResult.documentId})` })
    .from(aiProcessingResult)
    .get();

  const costRow = db
    .select({
      totalCost: sql<number>`coalesce(sum(${aiProcessingResult.estimatedCostUsd}), 0)`,
    })
    .from(aiProcessingResult)
    .get();

  const stats: AiStats = {
    totalProcessed: 0,
    unprocessed: (totalDocs?.count ?? 0) - (processedDocs?.count ?? 0),
    pendingReview: 0,
    applied: 0,
    rejected: 0,
    reverted: 0,
    failed: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalEstimatedCostUsd: costRow?.totalCost ?? 0,
  };

  for (const row of rows) {
    stats.totalProcessed += row.count;
    stats.totalPromptTokens += row.promptTokens;
    stats.totalCompletionTokens += row.completionTokens;

    switch (row.appliedStatus) {
      case 'pending_review':
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
      case 'reverted':
        stats.reverted += row.count;
        break;
      case 'failed':
        stats.failed += row.count;
        break;
    }
  }

  return stats;
}

export function markAiResultApplied(
  db: AppDatabase,
  id: string,
  appliedFields: string[],
  snapshot?: ApplySnapshot,
): void {
  const allFields = ['correspondent', 'documentType', 'tags'];
  const status = appliedFields.length === allFields.length ? 'applied' : 'partial';

  const setData: Record<string, unknown> = {
    appliedStatus: status,
    appliedAt: new Date().toISOString(),
    appliedFieldsJson: JSON.stringify(appliedFields),
  };

  if (snapshot) {
    setData.preApplyCorrespondentId = snapshot.preApply.correspondentId ?? null;
    setData.preApplyCorrespondentName = snapshot.preApply.correspondentName ?? null;
    setData.preApplyDocumentTypeId = snapshot.preApply.documentTypeId ?? null;
    setData.preApplyDocumentTypeName = snapshot.preApply.documentTypeName ?? null;
    setData.preApplyTagIdsJson = snapshot.preApply.tagIds
      ? JSON.stringify(snapshot.preApply.tagIds)
      : null;
    setData.preApplyTagNamesJson = snapshot.preApply.tagNames
      ? JSON.stringify(snapshot.preApply.tagNames)
      : null;
    setData.appliedCorrespondentId = snapshot.applied.correspondentId ?? null;
    setData.appliedDocumentTypeId = snapshot.applied.documentTypeId ?? null;
    setData.appliedTagIdsJson = snapshot.applied.tagIds
      ? JSON.stringify(snapshot.applied.tagIds)
      : null;
  }

  db.update(aiProcessingResult).set(setData).where(eq(aiProcessingResult.id, id)).run();
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

export function markAiResultFailed(
  db: AppDatabase,
  id: string,
  errorMessage: string,
  failureType?: string,
): void {
  db.update(aiProcessingResult)
    .set({
      appliedStatus: 'failed',
      appliedAt: new Date().toISOString(),
      errorMessage,
      failureType: failureType ?? null,
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

export function getPendingAiResultIds(db: AppDatabase): string[] {
  const rows = db
    .select({ id: aiProcessingResult.id })
    .from(aiProcessingResult)
    .where(eq(aiProcessingResult.appliedStatus, 'pending_review'))
    .all();

  return rows.map((r) => r.id);
}

export function getAiResultIdsByFilter(db: AppDatabase, filters: AiResultFilters): string[] {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(aiProcessingResult.appliedStatus, filters.status));
  }
  if (filters.search) {
    conditions.push(sql`${document.title} LIKE ${'%' + filters.search + '%'}`);
  }
  if (filters.failed === true) {
    conditions.push(eq(aiProcessingResult.appliedStatus, 'failed'));
  }
  if (filters.minConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= ${filters.minConfidence}`,
    );
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 <= ${filters.maxConfidence}`,
    );
  }
  if (filters.provider) {
    conditions.push(eq(aiProcessingResult.provider, filters.provider));
  }
  if (filters.model) {
    conditions.push(eq(aiProcessingResult.model, filters.model));
  }
  if (filters.changedOnly) {
    conditions.push(
      sql`(${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({ id: aiProcessingResult.id })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .all();

  return rows.map((r) => r.id);
}

export function getDocumentIdsByAiFilter(db: AppDatabase, filters: AiResultFilters): string[] {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(aiProcessingResult.appliedStatus, filters.status));
  }
  if (filters.search) {
    conditions.push(sql`${document.title} LIKE ${'%' + filters.search + '%'}`);
  }
  if (filters.failed === true) {
    conditions.push(eq(aiProcessingResult.appliedStatus, 'failed'));
  }
  if (filters.minConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= ${filters.minConfidence}`,
    );
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(
      sql`(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 <= ${filters.maxConfidence}`,
    );
  }
  if (filters.provider) {
    conditions.push(eq(aiProcessingResult.provider, filters.provider));
  }
  if (filters.model) {
    conditions.push(eq(aiProcessingResult.model, filters.model));
  }
  if (filters.changedOnly) {
    conditions.push(
      sql`(${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({ documentId: aiProcessingResult.documentId })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .all();

  return rows.map((r) => r.documentId);
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

export function getUnprocessedDocuments(
  db: AppDatabase,
  limit = 20,
  offset = 0,
  filters?: UnprocessedDocumentFilters,
): { items: UnprocessedDocument[]; total: number } {
  const conditions = [isNull(aiProcessingResult.id)];

  if (filters?.search) {
    conditions.push(like(document.title, `%${filters.search}%`));
  }
  if (filters?.correspondent) {
    conditions.push(eq(document.correspondent, filters.correspondent));
  }
  if (filters?.documentType) {
    conditions.push(eq(document.documentType, filters.documentType));
  }
  if (filters?.tag) {
    conditions.push(like(document.tagsJson, `%${filters.tag}%`));
  }

  const where = and(...conditions);

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(where)
    .get();
  const total = totalResult?.count ?? 0;

  let orderBy;
  switch (filters?.sort) {
    case 'oldest':
      orderBy = asc(document.paperlessId);
      break;
    case 'title_asc':
      orderBy = asc(document.title);
      break;
    case 'title_desc':
      orderBy = desc(document.title);
      break;
    case 'random': {
      const seed = filters.seed ?? 1;
      orderBy = sql`(${document.paperlessId} * ${seed}) % 2147483647`;
      break;
    }
    default:
      orderBy = desc(document.paperlessId);
  }

  const rows = db
    .select({
      id: document.id,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
    })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)
    .all();

  const items: UnprocessedDocument[] = rows.map((r) => ({
    id: r.id,
    paperlessId: r.paperlessId,
    title: r.title,
    correspondent: r.correspondent,
    documentType: r.documentType,
    tags: parseJsonArray(r.tagsJson),
  }));

  return { items, total };
}

export function getUnprocessedDocumentFacets(db: AppDatabase): {
  correspondents: string[];
  documentTypes: string[];
} {
  const correspondentRows = db
    .selectDistinct({ value: document.correspondent })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(and(isNull(aiProcessingResult.id), isNotNull(document.correspondent)))
    .orderBy(asc(document.correspondent))
    .all();

  const documentTypeRows = db
    .selectDistinct({ value: document.documentType })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(and(isNull(aiProcessingResult.id), isNotNull(document.documentType)))
    .orderBy(asc(document.documentType))
    .all();

  return {
    correspondents: correspondentRows.map((r) => r.value!),
    documentTypes: documentTypeRows.map((r) => r.value!),
  };
}
