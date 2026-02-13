import { and, count, desc, asc, eq, gte, lte, sql, inArray } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { parseTagsJson } from './helpers.js';
import type {
  DuplicateGroupFilters,
  DuplicateGroupSummary,
  DuplicateGroupDetail,
  DuplicateGroupMember,
  DuplicateStats,
  ConfidenceBucket,
  PaginatedResult,
  PaginationParams,
} from './types.js';

// ── List queries ────────────────────────────────────────────────────────

export function buildGroupWhere(filters: DuplicateGroupFilters) {
  const conditions = [];

  if (filters.minConfidence !== undefined) {
    conditions.push(gte(duplicateGroup.confidenceScore, filters.minConfidence));
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(lte(duplicateGroup.confidenceScore, filters.maxConfidence));
  }
  if (filters.reviewed !== undefined) {
    conditions.push(eq(duplicateGroup.reviewed, filters.reviewed));
  }
  if (filters.resolved !== undefined) {
    conditions.push(eq(duplicateGroup.resolved, filters.resolved));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function getDuplicateGroups(
  db: AppDatabase,
  filters: DuplicateGroupFilters,
  pagination: PaginationParams,
): PaginatedResult<DuplicateGroupSummary> {
  const where = buildGroupWhere(filters);

  const [{ value: total }] = db.select({ value: count() }).from(duplicateGroup).where(where).all();

  const orderCol =
    filters.sortBy === 'created_at'
      ? duplicateGroup.createdAt
      : filters.sortBy === 'member_count'
        ? sql`(SELECT COUNT(*) FROM duplicate_member WHERE group_id = ${duplicateGroup.id})`
        : duplicateGroup.confidenceScore;
  const orderFn = filters.sortOrder === 'asc' ? asc : desc;

  const groups = db
    .select()
    .from(duplicateGroup)
    .where(where)
    .orderBy(orderFn(orderCol))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  if (groups.length === 0) {
    return { items: [], total, limit: pagination.limit, offset: pagination.offset };
  }

  const groupIds = groups.map((g) => g.id);

  // Member counts per group
  const memberCounts = db
    .select({
      groupId: duplicateMember.groupId,
      memberCount: count(),
    })
    .from(duplicateMember)
    .where(inArray(duplicateMember.groupId, groupIds))
    .groupBy(duplicateMember.groupId)
    .all();

  const countMap = new Map(memberCounts.map((mc) => [mc.groupId, mc.memberCount]));

  // Primary document titles per group
  const primaryDocs = db
    .select({
      groupId: duplicateMember.groupId,
      title: document.title,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .where(and(inArray(duplicateMember.groupId, groupIds), eq(duplicateMember.isPrimary, true)))
    .all();

  const titleMap = new Map(primaryDocs.map((pd) => [pd.groupId, pd.title]));

  const items: DuplicateGroupSummary[] = groups.map((g) => ({
    id: g.id,
    confidenceScore: g.confidenceScore,
    reviewed: g.reviewed ?? false,
    resolved: g.resolved ?? false,
    memberCount: countMap.get(g.id) ?? 0,
    primaryDocumentTitle: titleMap.get(g.id) ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));

  return { items, total, limit: pagination.limit, offset: pagination.offset };
}

// ── Detail query ────────────────────────────────────────────────────────

export function getDuplicateGroup(db: AppDatabase, id: string): DuplicateGroupDetail | null {
  const group = db.select().from(duplicateGroup).where(eq(duplicateGroup.id, id)).get();

  if (!group) return null;

  // Load members with document data
  const memberRows = db
    .select({
      memberId: duplicateMember.id,
      documentId: duplicateMember.documentId,
      isPrimary: duplicateMember.isPrimary,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
      createdDate: document.createdDate,
      originalFileSize: document.originalFileSize,
      archiveFileSize: document.archiveFileSize,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .where(eq(duplicateMember.groupId, id))
    .all();

  // Batch-load content for all member documents
  const memberDocIds = memberRows.map((m) => m.documentId);
  const contentRows =
    memberDocIds.length > 0
      ? db
          .select()
          .from(documentContent)
          .where(inArray(documentContent.documentId, memberDocIds))
          .all()
      : [];

  const contentMap = new Map(contentRows.map((c) => [c.documentId, c]));

  const members: DuplicateGroupMember[] = memberRows.map((m) => {
    const content = contentMap.get(m.documentId);
    return {
      memberId: m.memberId,
      documentId: m.documentId,
      isPrimary: m.isPrimary ?? false,
      paperlessId: m.paperlessId,
      title: m.title,
      correspondent: m.correspondent,
      documentType: m.documentType,
      tags: parseTagsJson(m.tagsJson),
      createdDate: m.createdDate,
      originalFileSize: m.originalFileSize,
      archiveFileSize: m.archiveFileSize,
      content: content ? { fullText: content.fullText, wordCount: content.wordCount } : null,
    };
  });

  return {
    id: group.id,
    confidenceScore: group.confidenceScore,
    jaccardSimilarity: group.jaccardSimilarity,
    fuzzyTextRatio: group.fuzzyTextRatio,
    metadataSimilarity: group.metadataSimilarity,
    filenameSimilarity: group.filenameSimilarity,
    algorithmVersion: group.algorithmVersion,
    reviewed: group.reviewed ?? false,
    resolved: group.resolved ?? false,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members,
  };
}

// ── Light detail query (no fullText) ─────────────────────────────────────

export function getDuplicateGroupLight(db: AppDatabase, id: string): DuplicateGroupDetail | null {
  const group = db.select().from(duplicateGroup).where(eq(duplicateGroup.id, id)).get();

  if (!group) return null;

  const memberRows = db
    .select({
      memberId: duplicateMember.id,
      documentId: duplicateMember.documentId,
      isPrimary: duplicateMember.isPrimary,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
      createdDate: document.createdDate,
      originalFileSize: document.originalFileSize,
      archiveFileSize: document.archiveFileSize,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .where(eq(duplicateMember.groupId, id))
    .all();

  // Only load wordCount, not fullText
  const memberDocIds = memberRows.map((m) => m.documentId);
  const contentRows =
    memberDocIds.length > 0
      ? db
          .select({
            documentId: documentContent.documentId,
            wordCount: documentContent.wordCount,
          })
          .from(documentContent)
          .where(inArray(documentContent.documentId, memberDocIds))
          .all()
      : [];

  const contentMap = new Map(contentRows.map((c) => [c.documentId, c]));

  const members: DuplicateGroupMember[] = memberRows.map((m) => {
    const content = contentMap.get(m.documentId);
    return {
      memberId: m.memberId,
      documentId: m.documentId,
      isPrimary: m.isPrimary ?? false,
      paperlessId: m.paperlessId,
      title: m.title,
      correspondent: m.correspondent,
      documentType: m.documentType,
      tags: parseTagsJson(m.tagsJson),
      createdDate: m.createdDate,
      originalFileSize: m.originalFileSize,
      archiveFileSize: m.archiveFileSize,
      content: content ? { fullText: null, wordCount: content.wordCount } : null,
    };
  });

  return {
    id: group.id,
    confidenceScore: group.confidenceScore,
    jaccardSimilarity: group.jaccardSimilarity,
    fuzzyTextRatio: group.fuzzyTextRatio,
    metadataSimilarity: group.metadataSimilarity,
    filenameSimilarity: group.filenameSimilarity,
    algorithmVersion: group.algorithmVersion,
    reviewed: group.reviewed ?? false,
    resolved: group.resolved ?? false,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members,
  };
}

// ── Stats query ─────────────────────────────────────────────────────────

export function getDuplicateStats(db: AppDatabase): DuplicateStats {
  const [{ total }] = db.select({ total: count() }).from(duplicateGroup).all();

  const [{ reviewed }] = db
    .select({ reviewed: count() })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.reviewed, true))
    .all();

  const [{ resolved }] = db
    .select({ resolved: count() })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.resolved, true))
    .all();

  // Confidence histogram via CASE expression
  const buckets = db
    .select({
      bucket: sql<string>`CASE
        WHEN ${duplicateGroup.confidenceScore} < 0.50 THEN '0-50'
        WHEN ${duplicateGroup.confidenceScore} < 0.75 THEN '50-75'
        WHEN ${duplicateGroup.confidenceScore} < 0.85 THEN '75-85'
        WHEN ${duplicateGroup.confidenceScore} < 0.90 THEN '85-90'
        WHEN ${duplicateGroup.confidenceScore} < 0.95 THEN '90-95'
        ELSE '95-100'
      END`,
      count: count(),
    })
    .from(duplicateGroup)
    .groupBy(sql`1`)
    .all();

  const bucketDefs: { label: string; min: number; max: number }[] = [
    { label: '0-50%', min: 0, max: 0.5 },
    { label: '50-75%', min: 0.5, max: 0.75 },
    { label: '75-85%', min: 0.75, max: 0.85 },
    { label: '85-90%', min: 0.85, max: 0.9 },
    { label: '90-95%', min: 0.9, max: 0.95 },
    { label: '95-100%', min: 0.95, max: 1.0 },
  ];

  const bucketKeyMap: Record<string, string> = {
    '0-50': '0-50%',
    '50-75': '50-75%',
    '75-85': '75-85%',
    '85-90': '85-90%',
    '90-95': '90-95%',
    '95-100': '95-100%',
  };

  const bucketCountMap = new Map(buckets.map((b) => [bucketKeyMap[b.bucket] ?? b.bucket, b.count]));

  const confidenceDistribution: ConfidenceBucket[] = bucketDefs.map((def) => ({
    ...def,
    count: bucketCountMap.get(def.label) ?? 0,
  }));

  // Top correspondents
  const topCorrespondents = db
    .select({
      correspondent: document.correspondent,
      groupCount: sql<number>`COUNT(DISTINCT ${duplicateMember.groupId})`,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .innerJoin(duplicateGroup, eq(duplicateMember.groupId, duplicateGroup.id))
    .where(sql`${document.correspondent} IS NOT NULL AND ${duplicateGroup.resolved} = 0`)
    .groupBy(document.correspondent)
    .orderBy(sql`COUNT(DISTINCT ${duplicateMember.groupId}) DESC`)
    .limit(10)
    .all() as { correspondent: string; groupCount: number }[];

  return {
    totalGroups: total,
    reviewedGroups: reviewed,
    resolvedGroups: resolved,
    unresolvedGroups: total - resolved,
    confidenceDistribution,
    topCorrespondents,
  };
}

// ── Mutations ───────────────────────────────────────────────────────────

export function setPrimaryDocument(db: AppDatabase, groupId: string, documentId: string): boolean {
  const group = db
    .select({ id: duplicateGroup.id })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.id, groupId))
    .get();

  if (!group) return false;

  // Verify the document is a member of this group
  const member = db
    .select({ id: duplicateMember.id })
    .from(duplicateMember)
    .where(and(eq(duplicateMember.groupId, groupId), eq(duplicateMember.documentId, documentId)))
    .get();

  if (!member) return false;

  // Transaction: unset all, then set the new primary
  db.transaction((tx) => {
    tx.update(duplicateMember)
      .set({ isPrimary: false })
      .where(eq(duplicateMember.groupId, groupId))
      .run();

    tx.update(duplicateMember)
      .set({ isPrimary: true })
      .where(and(eq(duplicateMember.groupId, groupId), eq(duplicateMember.documentId, documentId)))
      .run();

    tx.update(duplicateGroup)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(duplicateGroup.id, groupId))
      .run();
  });

  return true;
}

export function markGroupReviewed(db: AppDatabase, groupId: string): boolean {
  const result = db
    .update(duplicateGroup)
    .set({ reviewed: true, updatedAt: new Date().toISOString() })
    .where(eq(duplicateGroup.id, groupId))
    .run();

  return result.changes > 0;
}

export function markGroupResolved(db: AppDatabase, groupId: string): boolean {
  const result = db
    .update(duplicateGroup)
    .set({ resolved: true, updatedAt: new Date().toISOString() })
    .where(eq(duplicateGroup.id, groupId))
    .run();

  return result.changes > 0;
}

export function deleteDuplicateGroup(db: AppDatabase, groupId: string): boolean {
  // Members are cascade-deleted via FK constraint
  const result = db.delete(duplicateGroup).where(eq(duplicateGroup.id, groupId)).run();

  return result.changes > 0;
}

// ── Batch operations ────────────────────────────────────────────────────

const CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function batchMarkReviewed(db: AppDatabase, groupIds: string[]): { updated: number } {
  let updated = 0;
  const now = new Date().toISOString();

  for (const chunk of chunkArray(groupIds, CHUNK_SIZE)) {
    const result = db
      .update(duplicateGroup)
      .set({ reviewed: true, updatedAt: now })
      .where(inArray(duplicateGroup.id, chunk))
      .run();
    updated += result.changes;
  }

  return { updated };
}

export function batchMarkResolved(db: AppDatabase, groupIds: string[]): { updated: number } {
  let updated = 0;
  const now = new Date().toISOString();

  for (const chunk of chunkArray(groupIds, CHUNK_SIZE)) {
    const result = db
      .update(duplicateGroup)
      .set({ resolved: true, updatedAt: now })
      .where(inArray(duplicateGroup.id, chunk))
      .run();
    updated += result.changes;
  }

  return { updated };
}
