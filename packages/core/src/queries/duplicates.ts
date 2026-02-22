import { and, count, desc, asc, eq, gte, lte, sql, inArray } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import type { GroupStatus } from '../types/enums.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { parseTagsJson } from './helpers.js';
import { incrementUsageStats } from './documents.js';
import type {
  DuplicateGroupFilters,
  DuplicateGroupSummary,
  DuplicateGroupDetail,
  DuplicateGroupMember,
  DuplicateStats,
  ConfidenceBucket,
  PaginatedResult,
  PaginationParams,
  SimilarityGraphFilters,
  GraphNode,
  GraphEdge,
  SimilarityGraphData,
} from './types.js';

// ── List queries ────────────────────────────────────────────────────────

export function buildGroupWhere(
  filters: Pick<DuplicateGroupFilters, 'minConfidence' | 'maxConfidence' | 'status'>,
) {
  const conditions = [];

  if (filters.minConfidence !== undefined) {
    conditions.push(gte(duplicateGroup.confidenceScore, filters.minConfidence));
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(lte(duplicateGroup.confidenceScore, filters.maxConfidence));
  }
  if (filters.status !== undefined && filters.status.length > 0) {
    if (filters.status.length === 1) {
      conditions.push(eq(duplicateGroup.status, filters.status[0]));
    } else {
      conditions.push(inArray(duplicateGroup.status, filters.status));
    }
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
    jaccardSimilarity: g.jaccardSimilarity,
    fuzzyTextRatio: g.fuzzyTextRatio,
    status: g.status,
    memberCount: countMap.get(g.id) ?? 0,
    primaryDocumentTitle: titleMap.get(g.id) ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));

  return { items, total, limit: pagination.limit, offset: pagination.offset };
}

// ── Detail query ────────────────────────────────────────────────────────

function fetchGroupWithMembers(
  db: AppDatabase,
  id: string,
  opts: { includeFullText: boolean },
): DuplicateGroupDetail | null {
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
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .where(eq(duplicateMember.groupId, id))
    .all();

  const memberDocIds = memberRows.map((m) => m.documentId);

  type ContentRow = { documentId: string; fullText: string | null; wordCount: number | null };
  type LightContentRow = { documentId: string; wordCount: number | null };

  let contentMap: Map<string, ContentRow | LightContentRow>;
  if (memberDocIds.length === 0) {
    contentMap = new Map();
  } else if (opts.includeFullText) {
    const rows = db
      .select()
      .from(documentContent)
      .where(inArray(documentContent.documentId, memberDocIds))
      .all();
    contentMap = new Map(rows.map((c) => [c.documentId, c]));
  } else {
    const rows = db
      .select({ documentId: documentContent.documentId, wordCount: documentContent.wordCount })
      .from(documentContent)
      .where(inArray(documentContent.documentId, memberDocIds))
      .all();
    contentMap = new Map(rows.map((c) => [c.documentId, c]));
  }

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
      content: content
        ? {
            fullText: 'fullText' in content ? (content.fullText as string | null) : null,
            wordCount: content.wordCount,
          }
        : null,
    };
  });

  return {
    id: group.id,
    confidenceScore: group.confidenceScore,
    jaccardSimilarity: group.jaccardSimilarity,
    fuzzyTextRatio: group.fuzzyTextRatio,
    algorithmVersion: group.algorithmVersion,
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members,
  };
}

export function getDuplicateGroup(db: AppDatabase, id: string): DuplicateGroupDetail | null {
  return fetchGroupWithMembers(db, id, { includeFullText: true });
}

export function getDuplicateGroupLight(db: AppDatabase, id: string): DuplicateGroupDetail | null {
  return fetchGroupWithMembers(db, id, { includeFullText: false });
}

// ── Stats query ─────────────────────────────────────────────────────────

export function getDuplicateStats(db: AppDatabase): DuplicateStats {
  const [{ total }] = db.select({ total: count() }).from(duplicateGroup).all();

  // Count by status
  const statusCounts = db
    .select({
      status: duplicateGroup.status,
      count: count(),
    })
    .from(duplicateGroup)
    .groupBy(duplicateGroup.status)
    .all();

  const statusMap = new Map(statusCounts.map((s) => [s.status, s.count]));

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

  // Top correspondents (pending groups only)
  const topCorrespondents = db
    .select({
      correspondent: document.correspondent,
      groupCount: sql<number>`COUNT(DISTINCT ${duplicateMember.groupId})`,
    })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .innerJoin(duplicateGroup, eq(duplicateMember.groupId, duplicateGroup.id))
    .where(sql`${document.correspondent} IS NOT NULL AND ${duplicateGroup.status} = 'pending'`)
    .groupBy(document.correspondent)
    .orderBy(sql`COUNT(DISTINCT ${duplicateMember.groupId}) DESC`)
    .limit(10)
    .all() as { correspondent: string; groupCount: number }[];

  return {
    totalGroups: total,
    pendingGroups: statusMap.get('pending') ?? 0,
    falsePositiveGroups: statusMap.get('false_positive') ?? 0,
    ignoredGroups: statusMap.get('ignored') ?? 0,
    deletedGroups: statusMap.get('deleted') ?? 0,
    confidenceDistribution,
    topCorrespondents,
  };
}

// ── Similarity graph query ───────────────────────────────────────────────

export function getSimilarityGraph(
  db: AppDatabase,
  filters: SimilarityGraphFilters,
): SimilarityGraphData {
  const where = buildGroupWhere(filters);

  // Count total matching groups
  const [{ value: totalGroupsMatched }] = db
    .select({ value: count() })
    .from(duplicateGroup)
    .where(where)
    .all();

  // Fetch top N groups by confidence desc
  const groups = db
    .select()
    .from(duplicateGroup)
    .where(where)
    .orderBy(desc(duplicateGroup.confidenceScore))
    .limit(filters.maxGroups)
    .all();

  if (groups.length === 0) {
    return { nodes: [], edges: [], totalGroupsMatched, groupsIncluded: 0 };
  }

  const groupIds = groups.map((g) => g.id);
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  // Fetch all members for those groups
  const memberRows = db
    .select({
      groupId: duplicateMember.groupId,
      documentId: duplicateMember.documentId,
    })
    .from(duplicateMember)
    .where(inArray(duplicateMember.groupId, groupIds))
    .all();

  // Collect unique document IDs
  const docIds = [...new Set(memberRows.map((m) => m.documentId))];

  // Fetch document metadata
  const docRows =
    docIds.length > 0
      ? db
          .select({
            id: document.id,
            paperlessId: document.paperlessId,
            title: document.title,
            correspondent: document.correspondent,
            documentType: document.documentType,
          })
          .from(document)
          .where(inArray(document.id, docIds))
          .all()
      : [];

  const docMap = new Map(docRows.map((d) => [d.id, d]));

  // Build members-by-group lookup
  const membersByGroup = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = membersByGroup.get(m.groupId);
    if (list) {
      list.push(m.documentId);
    } else {
      membersByGroup.set(m.groupId, [m.documentId]);
    }
  }

  // Count how many groups each document appears in
  const groupCountByDoc = new Map<string, number>();
  for (const m of memberRows) {
    groupCountByDoc.set(m.documentId, (groupCountByDoc.get(m.documentId) ?? 0) + 1);
  }

  // Build nodes from unique documents
  const nodes: GraphNode[] = docIds
    .map((id) => {
      const doc = docMap.get(id);
      if (!doc) return null;
      return {
        id: doc.id,
        paperlessId: doc.paperlessId,
        title: doc.title,
        correspondent: doc.correspondent,
        documentType: doc.documentType,
        groupCount: groupCountByDoc.get(id) ?? 1,
      };
    })
    .filter((n): n is GraphNode => n !== null);

  // Build edges: for each group with 2+ members, create pairwise edges
  const edges: GraphEdge[] = [];
  for (const [groupId, members] of membersByGroup) {
    if (members.length < 2) continue;
    const g = groupMap.get(groupId)!;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        edges.push({
          source: members[i],
          target: members[j],
          groupId,
          confidenceScore: g.confidenceScore,
          status: g.status,
        });
      }
    }
  }

  return { nodes, edges, totalGroupsMatched, groupsIncluded: groups.length };
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

export function setGroupStatus(db: AppDatabase, groupId: string, status: GroupStatus): boolean {
  const group = db
    .select({ id: duplicateGroup.id, status: duplicateGroup.status })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.id, groupId))
    .get();

  if (!group) return false;

  // Already at the requested status
  if (group.status === status) return true;

  const result = db
    .update(duplicateGroup)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(duplicateGroup.id, groupId))
    .run();

  if (result.changes > 0) {
    incrementUsageStats(db, { groupsActioned: 1 });
  }

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

export function batchSetStatus(
  db: AppDatabase,
  groupIds: string[],
  status: GroupStatus,
): { updated: number } {
  let updated = 0;
  const now = new Date().toISOString();

  for (const chunk of chunkArray(groupIds, CHUNK_SIZE)) {
    const result = db
      .update(duplicateGroup)
      .set({ status, updatedAt: now })
      .where(inArray(duplicateGroup.id, chunk))
      .run();
    updated += result.changes;
  }

  if (updated > 0) {
    incrementUsageStats(db, { groupsActioned: updated });
  }

  return { updated };
}
