import { eq, sql, desc, asc, and, isNull, isNotNull, like } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import { appConfig } from '../schema/sqlite/app.js';
import type { AppDatabase } from '../db/client.js';
import type { PaperlessCustomFieldInstance } from '../paperless/types.js';
import type { AiCustomFieldRecommendation } from './providers/types.js';

export interface ApplySnapshot {
  preApply: {
    title?: string | null;
    correspondentId?: number | null;
    correspondentName?: string | null;
    documentTypeId?: number | null;
    documentTypeName?: string | null;
    tagIds?: number[] | null;
    tagNames?: string[] | null;
    customFields?: PaperlessCustomFieldInstance[] | null;
  };
  applied: {
    title?: string | null;
    correspondentId?: number | null;
    documentTypeId?: number | null;
    tagIds?: number[] | null;
    tagAudit?: AppliedTagAudit | null;
    customFields?: PaperlessCustomFieldInstance[] | null;
  };
}

export interface AppliedTagAudit {
  after: number[];
  tagAdded: number[];
  tagRemoved: number[];
  processedTagId: number | null;
  processedTagAdded: boolean;
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
  suggestedTitle: string | null;
  suggestedCorrespondent: string | null;
  suggestedDocumentType: string | null;
  suggestedTags: string[];
  suggestedCustomFields: AiCustomFieldRecommendation[];
  confidence: {
    title: number;
    correspondent: number;
    documentType: number;
    tags: number;
  } | null;
  currentTitle: string | null;
  currentCorrespondent: string | null;
  currentDocumentType: string | null;
  currentTags: string[];
  currentCustomFields: PaperlessCustomFieldInstance[];
  appliedStatus: string;
  appliedAt: string | null;
  errorMessage: string | null;
  failureType: string | null;
  createdAt: string;
  safeFailure?: AiSafeFailure | null;
}

export type AiInboxQueue = 'review' | 'failures' | 'history';
export type AiFailureCategory = 'temporary' | 'no_content' | 'extraction' | 'configuration';

export interface AiSafeFailure {
  category: AiFailureCategory;
  label: string;
}

export interface AiInboxQuery {
  queue: AiInboxQueue;
  cursor?: string;
  limit?: number;
  search?: string;
  provider?: string;
  model?: string;
  changedOnly?: boolean;
  failureCategory?: AiFailureCategory;
  documentId?: string;
}

export interface AiFailureGroup extends AiSafeFailure {
  count: number;
}

export interface AiInboxPage {
  items: AiResultSummary[];
  total: number;
  nextCursor: string | null;
  previousCursor: string | null;
  failureGroups: AiFailureGroup[];
}

export interface AiResultDetail extends AiResultSummary {
  evidence: string | null;
  failureType: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  processingTimeMs: number | null;
  appliedFields: string[] | null;
  rawResponseJson: string | null;
  preApplyTitle: string | null;
  preApplyCorrespondentId: number | null;
  preApplyCorrespondentName: string | null;
  preApplyDocumentTypeId: number | null;
  preApplyDocumentTypeName: string | null;
  preApplyTagIds: number[] | null;
  preApplyTagNames: string[] | null;
  preApplyCustomFields: PaperlessCustomFieldInstance[] | null;
  appliedTitle: string | null;
  appliedCorrespondentId: number | null;
  appliedDocumentTypeId: number | null;
  appliedTagIds: number[] | null;
  appliedCustomFields: PaperlessCustomFieldInstance[] | null;
  revertedAt: string | null;
}

export interface AiInboxTruncation {
  truncated: boolean;
  paths: string[];
}

export type AiInboxResultDetail = Omit<AiResultDetail, 'rawResponseJson'> & {
  truncation: AiInboxTruncation;
};

export interface AiStats {
  totalProcessed: number;
  unprocessed: number;
  pendingReview: number;
  applied: number;
  rejected: number;
  reverted: number;
  failed: number;
  skipped: number;
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

function parseCustomFieldRecommendations(json: string | null): AiCustomFieldRecommendation[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseCustomFieldInstances(json: string | null): PaperlessCustomFieldInstance[] {
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
    const value = JSON.parse(json) as number[] | AppliedTagAudit;
    return Array.isArray(value) ? value : value.after;
  } catch {
    return null;
  }
}

function parseConfidence(
  json: string | null,
): { title: number; correspondent: number; documentType: number; tags: number } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // Backward compat: older results may lack 'title' confidence
    return { title: parsed.title ?? 0, ...parsed };
  } catch {
    return null;
  }
}

const FAILURE_LABELS: Record<AiFailureCategory, string> = {
  temporary: 'Temporary service issue',
  no_content: 'No OCR content',
  extraction: 'Extraction could not be completed',
  configuration: 'AI configuration needs attention',
};

function safeFailureCategory(failureType: string | null): AiFailureCategory {
  switch (failureType) {
    case 'rate_limit':
    case 'timeout':
    case 'network':
    case 'provider_unavailable':
      return 'temporary';
    case 'no_content':
      return 'no_content';
    case 'authentication':
    case 'configuration':
    case 'permission':
      return 'configuration';
    default:
      return 'extraction';
  }
}

function safeFailure(failureType: string | null): AiSafeFailure {
  const category = safeFailureCategory(failureType);
  return { category, label: FAILURE_LABELS[category] };
}

interface AiInboxCursor {
  v: 1;
  queue: AiInboxQueue;
  direction: 'next' | 'previous';
  rank: number | string;
  createdAt: string;
  id: string;
  filters: string;
}

const AI_INBOX_CURSOR_KEY = 'internal.aiInboxCursorKey';

function getAiInboxCursorKey(db: AppDatabase): string {
  const existing = db.select().from(appConfig).where(eq(appConfig.key, AI_INBOX_CURSOR_KEY)).get();
  if (existing) return existing.value;
  const value = randomBytes(32).toString('base64url');
  db.insert(appConfig)
    .values({ key: AI_INBOX_CURSOR_KEY, value, updatedAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
  return (
    db.select().from(appConfig).where(eq(appConfig.key, AI_INBOX_CURSOR_KEY)).get()?.value ?? value
  );
}

function canonicalAiInboxFilters(query: AiInboxQuery): string {
  return JSON.stringify({
    queue: query.queue,
    search: query.search?.trim() || null,
    provider: query.provider || null,
    model: query.model || null,
    changedOnly: query.changedOnly === true,
    failureCategory: query.failureCategory ?? null,
    documentId: query.documentId || null,
  });
}

function encodeAiInboxCursor(db: AppDatabase, cursor: AiInboxCursor): string {
  const nonce = randomBytes(12);
  const key = Buffer.from(getAiInboxCursorKey(db), 'base64url');
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from('ai-inbox-cursor:v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cursor), 'utf8'), cipher.final()]);
  return [
    'v1',
    nonce.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

function decodeAiInboxCursor(
  db: AppDatabase,
  value: string,
  queue: AiInboxQueue,
  filters: string,
): AiInboxCursor {
  try {
    const [version, encodedNonce, encodedCiphertext, encodedTag, extra] = value.split('.');
    if (version !== 'v1' || !encodedNonce || !encodedCiphertext || !encodedTag || extra) {
      throw new Error('invalid');
    }
    const nonce = Buffer.from(encodedNonce, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('invalid');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(getAiInboxCursorKey(db), 'base64url'),
      nonce,
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from('ai-inbox-cursor:v1'));
    decipher.setAuthTag(tag);
    const payload = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const decoded = JSON.parse(payload) as AiInboxCursor;
    if (
      decoded.v !== 1 ||
      decoded.queue !== queue ||
      decoded.filters !== filters ||
      (decoded.direction !== 'next' && decoded.direction !== 'previous') ||
      (typeof decoded.rank !== 'number' && typeof decoded.rank !== 'string') ||
      !Number.isFinite(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0
    ) {
      throw new Error('invalid');
    }
    return decoded;
  } catch {
    throw new Error('Invalid AI inbox cursor');
  }
}

const confidenceRank = sql<number>`(
  coalesce(json_extract(${aiProcessingResult.confidenceJson}, '$.title'), 0) +
  coalesce(json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent'), 0) +
  coalesce(json_extract(${aiProcessingResult.confidenceJson}, '$.documentType'), 0) +
  coalesce(json_extract(${aiProcessingResult.confidenceJson}, '$.tags'), 0)
) / 4.0`;

const failureRank = sql<string>`case
  when ${aiProcessingResult.failureType} in ('rate_limit', 'timeout', 'network', 'provider_unavailable') then '1-temporary'
  when ${aiProcessingResult.failureType} = 'no_content' then '2-no_content'
  when ${aiProcessingResult.failureType} in ('authentication', 'configuration', 'permission') then '4-configuration'
  else '3-extraction'
end`;
const historyRank = sql<string>`coalesce(${aiProcessingResult.appliedAt}, ${aiProcessingResult.createdAt})`;

/**
 * Cursor-based review/failure inbox. This is opt-in so the existing offset API
 * remains compatible for integrations that have not migrated yet.
 */
export function listAiReviewInbox(db: AppDatabase, query: AiInboxQuery): AiInboxPage {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const rankExpression =
    query.queue === 'review'
      ? confidenceRank
      : query.queue === 'history'
        ? historyRank
        : failureRank;
  const conditions = [
    query.queue === 'review'
      ? sql`(${aiProcessingResult.appliedStatus} = 'pending_review' OR (${aiProcessingResult.appliedStatus} = 'failed' AND ${aiProcessingResult.failureType} = 'review_conflict'))`
      : query.queue === 'history'
        ? sql`${aiProcessingResult.appliedStatus} in ('applied', 'partial', 'reverted', 'rejected')`
        : sql`(${aiProcessingResult.appliedStatus} = 'skipped' OR (${aiProcessingResult.appliedStatus} = 'failed' AND coalesce(${aiProcessingResult.failureType}, '') <> 'review_conflict'))`,
  ];

  if (query.search) conditions.push(like(document.title, `%${query.search}%`));
  if (query.provider) conditions.push(eq(aiProcessingResult.provider, query.provider));
  if (query.model) conditions.push(eq(aiProcessingResult.model, query.model));
  if (query.documentId) conditions.push(eq(aiProcessingResult.documentId, query.documentId));
  if (query.changedOnly) {
    conditions.push(
      sql`(${aiProcessingResult.suggestedTitle} IS NOT ${aiProcessingResult.currentTitle} OR ${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson} OR json_array_length(coalesce(${aiProcessingResult.suggestedCustomFieldsJson}, '[]')) > 0)`,
    );
  }
  if (query.queue === 'failures' && query.failureCategory) {
    const requestedRank = {
      temporary: '1-temporary',
      no_content: '2-no_content',
      extraction: '3-extraction',
      configuration: '4-configuration',
    }[query.failureCategory];
    conditions.push(sql`${failureRank} = ${requestedRank}`);
  }
  const failureGroupsWhere = and(...conditions);

  const baseWhere = and(...conditions);
  const canonicalFilters = canonicalAiInboxFilters(query);
  const cursor = query.cursor
    ? decodeAiInboxCursor(db, query.cursor, query.queue, canonicalFilters)
    : null;
  const isDescending = query.queue !== 'failures';
  const isPrevious = cursor?.direction === 'previous';

  if (cursor) {
    const comparison = isDescending !== isPrevious ? '<' : '>';
    conditions.push(
      sql`(
        ${rankExpression} ${sql.raw(comparison)} ${cursor.rank}
        OR (${rankExpression} = ${cursor.rank} AND ${aiProcessingResult.createdAt} ${sql.raw(comparison)} ${cursor.createdAt})
        OR (${rankExpression} = ${cursor.rank} AND ${aiProcessingResult.createdAt} = ${cursor.createdAt} AND ${aiProcessingResult.id} ${sql.raw(comparison)} ${cursor.id})
      )`,
    );
  }

  const where = and(...conditions);
  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(aiProcessingResult)
      .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
      .where(baseWhere)
      .get()?.count ?? 0;

  const descendingForQuery = isDescending !== isPrevious;
  const rows = db
    .select({
      id: aiProcessingResult.id,
      documentId: aiProcessingResult.documentId,
      paperlessId: aiProcessingResult.paperlessId,
      documentTitle: document.title,
      provider: aiProcessingResult.provider,
      model: aiProcessingResult.model,
      suggestedTitle: aiProcessingResult.suggestedTitle,
      suggestedCorrespondent: aiProcessingResult.suggestedCorrespondent,
      suggestedDocumentType: aiProcessingResult.suggestedDocumentType,
      suggestedTagsJson: aiProcessingResult.suggestedTagsJson,
      suggestedCustomFieldsJson: aiProcessingResult.suggestedCustomFieldsJson,
      confidenceJson: aiProcessingResult.confidenceJson,
      currentTitle: aiProcessingResult.currentTitle,
      currentCorrespondent: aiProcessingResult.currentCorrespondent,
      currentDocumentType: aiProcessingResult.currentDocumentType,
      currentTagsJson: aiProcessingResult.currentTagsJson,
      currentCustomFieldsJson: aiProcessingResult.currentCustomFieldsJson,
      appliedStatus: aiProcessingResult.appliedStatus,
      appliedAt: aiProcessingResult.appliedAt,
      failureType: aiProcessingResult.failureType,
      createdAt: aiProcessingResult.createdAt,
      rank: rankExpression,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .orderBy(
      descendingForQuery ? desc(rankExpression) : asc(rankExpression),
      descendingForQuery ? desc(aiProcessingResult.createdAt) : asc(aiProcessingResult.createdAt),
      descendingForQuery ? desc(aiProcessingResult.id) : asc(aiProcessingResult.id),
    )
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  let pageRows = rows.slice(0, limit);
  if (isPrevious) pageRows = pageRows.reverse();

  const items: AiResultSummary[] = pageRows.map((row) => ({
    id: row.id,
    documentId: row.documentId,
    paperlessId: row.paperlessId,
    documentTitle: row.documentTitle,
    provider: row.provider,
    model: row.model,
    suggestedTitle: row.suggestedTitle ?? null,
    suggestedCorrespondent: row.suggestedCorrespondent,
    suggestedDocumentType: row.suggestedDocumentType,
    suggestedTags: parseJsonArray(row.suggestedTagsJson),
    suggestedCustomFields: parseCustomFieldRecommendations(row.suggestedCustomFieldsJson),
    confidence: parseConfidence(row.confidenceJson),
    currentTitle: row.currentTitle ?? null,
    currentCorrespondent: row.currentCorrespondent,
    currentDocumentType: row.currentDocumentType,
    currentTags: parseJsonArray(row.currentTagsJson),
    currentCustomFields: parseCustomFieldInstances(row.currentCustomFieldsJson),
    appliedStatus: row.appliedStatus ?? 'pending_review',
    appliedAt: row.appliedAt,
    errorMessage: null,
    failureType: row.failureType ?? null,
    createdAt: row.createdAt,
    safeFailure: query.queue === 'failures' ? safeFailure(row.failureType) : null,
  }));

  const cursorFor = (
    row: (typeof pageRows)[number],
    direction: AiInboxCursor['direction'],
  ): string =>
    encodeAiInboxCursor(db, {
      v: 1,
      queue: query.queue,
      direction,
      rank: row.rank,
      createdAt: row.createdAt,
      id: row.id,
      filters: canonicalFilters,
    });

  const failureGroups =
    query.queue === 'failures'
      ? Object.entries(
          db
            .select({
              failureType: aiProcessingResult.failureType,
              count: sql<number>`count(*)`,
            })
            .from(aiProcessingResult)
            .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
            .where(failureGroupsWhere)
            .groupBy(aiProcessingResult.failureType)
            .all()
            .reduce<Record<AiFailureCategory, number>>(
              (groups, row) => {
                const category = safeFailureCategory(row.failureType);
                groups[category] = (groups[category] ?? 0) + row.count;
                return groups;
              },
              {} as Record<AiFailureCategory, number>,
            ),
        )
          .map(([category, count]) => ({
            category: category as AiFailureCategory,
            count,
            label: FAILURE_LABELS[category as AiFailureCategory],
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      : [];

  return {
    items,
    total,
    nextCursor:
      pageRows.length > 0 && (hasMore || isPrevious)
        ? cursorFor(pageRows[pageRows.length - 1], 'next')
        : null,
    previousCursor:
      pageRows.length > 0 && ((!isPrevious && cursor) || (isPrevious && hasMore))
        ? cursorFor(pageRows[0], 'previous')
        : null,
    failureGroups,
  };
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
      sql`(${aiProcessingResult.suggestedTitle} IS NOT ${aiProcessingResult.currentTitle} OR ${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson} OR json_array_length(coalesce(${aiProcessingResult.suggestedCustomFieldsJson}, '[]')) > 0)`,
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
      suggestedTitle: aiProcessingResult.suggestedTitle,
      suggestedCorrespondent: aiProcessingResult.suggestedCorrespondent,
      suggestedDocumentType: aiProcessingResult.suggestedDocumentType,
      suggestedTagsJson: aiProcessingResult.suggestedTagsJson,
      suggestedCustomFieldsJson: aiProcessingResult.suggestedCustomFieldsJson,
      confidenceJson: aiProcessingResult.confidenceJson,
      currentTitle: aiProcessingResult.currentTitle,
      currentCorrespondent: aiProcessingResult.currentCorrespondent,
      currentDocumentType: aiProcessingResult.currentDocumentType,
      currentTagsJson: aiProcessingResult.currentTagsJson,
      currentCustomFieldsJson: aiProcessingResult.currentCustomFieldsJson,
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
    suggestedTitle: r.suggestedTitle ?? null,
    suggestedCorrespondent: r.suggestedCorrespondent,
    suggestedDocumentType: r.suggestedDocumentType,
    suggestedTags: parseJsonArray(r.suggestedTagsJson),
    suggestedCustomFields: parseCustomFieldRecommendations(r.suggestedCustomFieldsJson),
    confidence: parseConfidence(r.confidenceJson),
    currentTitle: r.currentTitle ?? null,
    currentCorrespondent: r.currentCorrespondent,
    currentDocumentType: r.currentDocumentType,
    currentTags: parseJsonArray(r.currentTagsJson),
    currentCustomFields: parseCustomFieldInstances(r.currentCustomFieldsJson),
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
      suggestedTitle: aiProcessingResult.suggestedTitle,
      suggestedCorrespondent: aiProcessingResult.suggestedCorrespondent,
      suggestedDocumentType: aiProcessingResult.suggestedDocumentType,
      suggestedTagsJson: aiProcessingResult.suggestedTagsJson,
      suggestedCustomFieldsJson: aiProcessingResult.suggestedCustomFieldsJson,
      confidenceJson: aiProcessingResult.confidenceJson,
      currentTitle: aiProcessingResult.currentTitle,
      currentCorrespondent: aiProcessingResult.currentCorrespondent,
      currentDocumentType: aiProcessingResult.currentDocumentType,
      currentTagsJson: aiProcessingResult.currentTagsJson,
      currentCustomFieldsJson: aiProcessingResult.currentCustomFieldsJson,
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
      preApplyTitle: aiProcessingResult.preApplyTitle,
      preApplyCorrespondentId: aiProcessingResult.preApplyCorrespondentId,
      preApplyCorrespondentName: aiProcessingResult.preApplyCorrespondentName,
      preApplyDocumentTypeId: aiProcessingResult.preApplyDocumentTypeId,
      preApplyDocumentTypeName: aiProcessingResult.preApplyDocumentTypeName,
      preApplyTagIdsJson: aiProcessingResult.preApplyTagIdsJson,
      preApplyTagNamesJson: aiProcessingResult.preApplyTagNamesJson,
      preApplyCustomFieldsJson: aiProcessingResult.preApplyCustomFieldsJson,
      appliedTitle: aiProcessingResult.appliedTitle,
      appliedCorrespondentId: aiProcessingResult.appliedCorrespondentId,
      appliedDocumentTypeId: aiProcessingResult.appliedDocumentTypeId,
      appliedTagIdsJson: aiProcessingResult.appliedTagIdsJson,
      appliedCustomFieldsJson: aiProcessingResult.appliedCustomFieldsJson,
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
    suggestedTitle: row.suggestedTitle ?? null,
    suggestedCorrespondent: row.suggestedCorrespondent,
    suggestedDocumentType: row.suggestedDocumentType,
    suggestedTags: parseJsonArray(row.suggestedTagsJson),
    suggestedCustomFields: parseCustomFieldRecommendations(row.suggestedCustomFieldsJson),
    confidence: parseConfidence(row.confidenceJson),
    currentTitle: row.currentTitle ?? null,
    currentCorrespondent: row.currentCorrespondent,
    currentDocumentType: row.currentDocumentType,
    currentTags: parseJsonArray(row.currentTagsJson),
    currentCustomFields: parseCustomFieldInstances(row.currentCustomFieldsJson),
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
    preApplyTitle: row.preApplyTitle ?? null,
    preApplyCorrespondentId: row.preApplyCorrespondentId ?? null,
    preApplyCorrespondentName: row.preApplyCorrespondentName ?? null,
    preApplyDocumentTypeId: row.preApplyDocumentTypeId ?? null,
    preApplyDocumentTypeName: row.preApplyDocumentTypeName ?? null,
    preApplyTagIds: parseJsonNumberArray(row.preApplyTagIdsJson),
    preApplyTagNames: parseJsonArray(row.preApplyTagNamesJson),
    preApplyCustomFields: row.preApplyCustomFieldsJson
      ? parseCustomFieldInstances(row.preApplyCustomFieldsJson)
      : null,
    appliedTitle: row.appliedTitle ?? null,
    appliedCorrespondentId: row.appliedCorrespondentId ?? null,
    appliedDocumentTypeId: row.appliedDocumentTypeId ?? null,
    appliedTagIds: parseJsonNumberArray(row.appliedTagIdsJson),
    appliedCustomFields: row.appliedCustomFieldsJson
      ? parseCustomFieldInstances(row.appliedCustomFieldsJson)
      : null,
    revertedAt: row.revertedAt ?? null,
  };
}

export function getAiInboxResult(db: AppDatabase, id: string): AiInboxResultDetail | null {
  const result = getAiResult(db, id);
  if (!result) return null;
  const { rawResponseJson: _rawResponseJson, ...safe } = result;
  const { evidence, ...safeWithoutEvidence } = safe;
  const truncationPaths = new Set<string>();
  const budget = { remaining: 24_000 };
  const bounded = sanitizeAiInboxValue(
    {
      evidence,
      ...safeWithoutEvidence,
      errorMessage: null,
      safeFailure:
        safe.appliedStatus === 'failed' || safe.appliedStatus === 'skipped'
          ? safeFailure(safe.failureType)
          : null,
    },
    '',
    budget,
    truncationPaths,
    0,
  ) as Omit<AiResultDetail, 'rawResponseJson'>;
  return {
    ...bounded,
    truncation: {
      truncated: truncationPaths.size > 0,
      paths: [...truncationPaths],
    },
  };
}

function sanitizeAiInboxValue(
  value: unknown,
  path: string,
  budget: { remaining: number },
  truncatedPaths: Set<string>,
  depth: number,
): unknown {
  const markTruncated = () => {
    if (truncatedPaths.size < 50) truncatedPaths.add((path || 'root').slice(0, 160));
  };
  if (typeof value === 'string') {
    // These values are the inbox contract rather than model/document display
    // content.  They drive action eligibility and audit rendering, so a large
    // suggestion must never erase them by consuming the display budget first.
    if (isAiInboxControlPath(path)) return value;
    const allowed = Math.max(0, Math.min(500, budget.remaining));
    if (value.length > allowed) markTruncated();
    const bounded = value.slice(0, allowed);
    budget.remaining -= bounded.length;
    return bounded;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 6) {
    markTruncated();
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > 25) markTruncated();
    return value
      .slice(0, 25)
      .map((item, index) =>
        sanitizeAiInboxValue(item, `${path}[${index}]`, budget, truncatedPaths, depth + 1),
      );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const maxEntries = depth === 0 ? entries.length : 25;
    if (entries.length > maxEntries) markTruncated();
    return Object.fromEntries(
      entries.slice(0, maxEntries).map(([key, item]) => {
        // Object keys describe the structured API shape.  Do not spend the
        // display-value budget on them: doing so can turn `{ fieldId: 7 }`
        // into `{ '': 7 }` after a large earlier suggestion.  Arbitrary
        // nested keys are still capped independently.
        const allowedKeyLength = depth === 0 ? key.length : Math.min(100, key.length);
        if (key.length > allowedKeyLength) markTruncated();
        const boundedKey = key.slice(0, allowedKeyLength);
        return [
          boundedKey,
          sanitizeAiInboxValue(
            item,
            path ? `${path}.${boundedKey}` : boundedKey,
            budget,
            truncatedPaths,
            depth + 1,
          ),
        ];
      }),
    );
  }
  markTruncated();
  return null;
}

function isAiInboxControlPath(path: string): boolean {
  if (
    new Set([
      'id',
      'documentId',
      'provider',
      'model',
      'appliedStatus',
      'appliedAt',
      'failureType',
      'createdAt',
      'revertedAt',
    ]).has(path)
  ) {
    return true;
  }
  return path === 'safeFailure.category' || path === 'safeFailure.label';
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
    skipped: 0,
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
      case 'skipped':
        stats.skipped += row.count;
        break;
    }
  }

  return stats;
}

export function clearAllAiResults(db: AppDatabase): number {
  const result = db.delete(aiProcessingResult).run();
  return result.changes;
}

export function markAiResultApplied(
  db: AppDatabase,
  id: string,
  appliedFields: string[],
  snapshot?: ApplySnapshot,
): void {
  const allFields = ['title', 'correspondent', 'documentType', 'tags'];
  if (appliedFields.includes('customFields')) allFields.push('customFields');
  const status = allFields.every((field) => appliedFields.includes(field)) ? 'applied' : 'partial';

  const setData: Record<string, unknown> = {
    appliedStatus: status,
    appliedAt: new Date().toISOString(),
    appliedFieldsJson: JSON.stringify(appliedFields),
  };

  if (snapshot) {
    setData.preApplyTitle = snapshot.preApply.title ?? null;
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
    setData.preApplyCustomFieldsJson = snapshot.preApply.customFields
      ? JSON.stringify(snapshot.preApply.customFields)
      : null;
    setData.appliedTitle = snapshot.applied.title ?? null;
    setData.appliedCorrespondentId = snapshot.applied.correspondentId ?? null;
    setData.appliedDocumentTypeId = snapshot.applied.documentTypeId ?? null;
    setData.appliedTagIdsJson = snapshot.applied.tagAudit
      ? JSON.stringify(snapshot.applied.tagAudit)
      : snapshot.applied.tagIds
        ? JSON.stringify(snapshot.applied.tagIds)
        : null;
    setData.appliedCustomFieldsJson = snapshot.applied.customFields
      ? JSON.stringify(snapshot.applied.customFields)
      : null;
  }

  db.update(aiProcessingResult).set(setData).where(eq(aiProcessingResult.id, id)).run();
}

/** Persist the exact reviewed intent before crossing the remote mutation boundary. */
export function markAiResultApplyStarted(
  db: AppDatabase,
  id: string,
  appliedFields: string[],
  snapshot: ApplySnapshot,
): void {
  db.update(aiProcessingResult)
    .set({
      appliedFieldsJson: JSON.stringify(appliedFields),
      preApplyTitle: snapshot.preApply.title ?? null,
      preApplyCorrespondentId: snapshot.preApply.correspondentId ?? null,
      preApplyCorrespondentName: snapshot.preApply.correspondentName ?? null,
      preApplyDocumentTypeId: snapshot.preApply.documentTypeId ?? null,
      preApplyDocumentTypeName: snapshot.preApply.documentTypeName ?? null,
      preApplyTagIdsJson: snapshot.preApply.tagIds
        ? JSON.stringify(snapshot.preApply.tagIds)
        : null,
      preApplyTagNamesJson: snapshot.preApply.tagNames
        ? JSON.stringify(snapshot.preApply.tagNames)
        : null,
      preApplyCustomFieldsJson: snapshot.preApply.customFields
        ? JSON.stringify(snapshot.preApply.customFields)
        : null,
      appliedTitle: snapshot.applied.title ?? null,
      appliedCorrespondentId: snapshot.applied.correspondentId ?? null,
      appliedDocumentTypeId: snapshot.applied.documentTypeId ?? null,
      appliedTagIdsJson: snapshot.applied.tagAudit
        ? JSON.stringify(snapshot.applied.tagAudit)
        : snapshot.applied.tagIds
          ? JSON.stringify(snapshot.applied.tagIds)
          : null,
      appliedCustomFieldsJson: snapshot.applied.customFields
        ? JSON.stringify(snapshot.applied.customFields)
        : null,
    })
    .where(eq(aiProcessingResult.id, id))
    .run();
}

export function finalizeStartedAiApply(db: AppDatabase, id: string, appliedFields: string[]): void {
  const standardFields = ['title', 'correspondent', 'documentType', 'tags'];
  const status = standardFields.every((field) => appliedFields.includes(field))
    ? 'applied'
    : 'partial';
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
  const allFields = ['title', 'correspondent', 'documentType', 'tags'];
  if (appliedFields.includes('customFields')) allFields.push('customFields');
  const status = allFields.every((field) => appliedFields.includes(field)) ? 'applied' : 'partial';
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
      sql`(${aiProcessingResult.suggestedTitle} IS NOT ${aiProcessingResult.currentTitle} OR ${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson} OR json_array_length(coalesce(${aiProcessingResult.suggestedCustomFieldsJson}, '[]')) > 0)`,
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
      sql`(${aiProcessingResult.suggestedTitle} IS NOT ${aiProcessingResult.currentTitle} OR ${aiProcessingResult.suggestedCorrespondent} IS NOT ${aiProcessingResult.currentCorrespondent} OR ${aiProcessingResult.suggestedDocumentType} IS NOT ${aiProcessingResult.currentDocumentType} OR ${aiProcessingResult.suggestedTagsJson} IS NOT ${aiProcessingResult.currentTagsJson} OR json_array_length(coalesce(${aiProcessingResult.suggestedCustomFieldsJson}, '[]')) > 0)`,
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
