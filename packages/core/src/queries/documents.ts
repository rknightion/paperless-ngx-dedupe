import { and, asc, avg, count, desc, eq, isNotNull, isNull, like, sql, sum } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { syncState } from '../schema/sqlite/app.js';
import { parseTagsJson } from './helpers.js';
import type {
  DocumentFilters,
  DocumentStats,
  DocumentSummary,
  DocumentDetail,
  PaginatedResult,
  PaginationParams,
} from './types.js';

function buildDocumentWhere(filters: DocumentFilters) {
  const conditions = [];

  if (filters.correspondent) {
    conditions.push(eq(document.correspondent, filters.correspondent));
  }
  if (filters.documentType) {
    conditions.push(eq(document.documentType, filters.documentType));
  }
  if (filters.tag) {
    conditions.push(like(document.tagsJson, `%${filters.tag}%`));
  }
  if (filters.processingStatus) {
    conditions.push(eq(document.processingStatus, filters.processingStatus));
  }
  if (filters.search) {
    conditions.push(like(document.title, `%${filters.search}%`));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function getDocuments(
  db: AppDatabase,
  filters: DocumentFilters,
  pagination: PaginationParams,
): PaginatedResult<DocumentSummary> {
  const where = buildDocumentWhere(filters);

  const [{ value: total }] = db.select({ value: count() }).from(document).where(where).all();

  const rows = db
    .select()
    .from(document)
    .where(where)
    .orderBy(desc(document.paperlessId))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const items: DocumentSummary[] = rows.map((row) => ({
    id: row.id,
    paperlessId: row.paperlessId,
    title: row.title,
    correspondent: row.correspondent,
    documentType: row.documentType,
    tags: parseTagsJson(row.tagsJson),
    createdDate: row.createdDate,
    addedDate: row.addedDate,
    processingStatus: row.processingStatus,
    originalFileSize: row.originalFileSize,
    archiveFileSize: row.archiveFileSize,
  }));

  return { items, total, limit: pagination.limit, offset: pagination.offset };
}

export function getDocument(db: AppDatabase, id: string): DocumentDetail | null {
  const row = db.select().from(document).where(eq(document.id, id)).get();
  if (!row) return null;

  // Load content
  const contentRow = db
    .select()
    .from(documentContent)
    .where(eq(documentContent.documentId, id))
    .get();

  // Load group memberships
  const memberships = db
    .select({
      groupId: duplicateMember.groupId,
      confidenceScore: duplicateGroup.confidenceScore,
      isPrimary: duplicateMember.isPrimary,
      reviewed: duplicateGroup.reviewed,
      resolved: duplicateGroup.resolved,
    })
    .from(duplicateMember)
    .innerJoin(duplicateGroup, eq(duplicateMember.groupId, duplicateGroup.id))
    .where(eq(duplicateMember.documentId, id))
    .all();

  return {
    id: row.id,
    paperlessId: row.paperlessId,
    title: row.title,
    correspondent: row.correspondent,
    documentType: row.documentType,
    tags: parseTagsJson(row.tagsJson),
    createdDate: row.createdDate,
    addedDate: row.addedDate,
    modifiedDate: row.modifiedDate,
    processingStatus: row.processingStatus,
    originalFileSize: row.originalFileSize,
    archiveFileSize: row.archiveFileSize,
    fingerprint: row.fingerprint,
    syncedAt: row.syncedAt,
    content: contentRow
      ? {
          fullText: contentRow.fullText,
          normalizedText: contentRow.normalizedText,
          wordCount: contentRow.wordCount,
          contentHash: contentRow.contentHash,
        }
      : null,
    groupMemberships: memberships.map((m) => ({
      groupId: m.groupId,
      confidenceScore: m.confidenceScore,
      isPrimary: m.isPrimary ?? false,
      reviewed: m.reviewed ?? false,
      resolved: m.resolved ?? false,
    })),
  };
}

export function getDocumentContent(
  db: AppDatabase,
  documentId: string,
): { fullText: string | null; wordCount: number | null } | null {
  const row = db
    .select({
      fullText: documentContent.fullText,
      wordCount: documentContent.wordCount,
    })
    .from(documentContent)
    .where(eq(documentContent.documentId, documentId))
    .get();

  return row ?? null;
}

export function incrementUsageStats(
  db: AppDatabase,
  increments: {
    groupsResolved?: number;
    documentsDeleted?: number;
    storageBytesReclaimed?: number;
    groupsReviewed?: number;
  },
): void {
  const sets: Record<string, unknown> = {};

  if (increments.groupsResolved) {
    sets.cumulativeGroupsResolved = sql`coalesce(${syncState.cumulativeGroupsResolved}, 0) + ${increments.groupsResolved}`;
  }
  if (increments.documentsDeleted) {
    sets.cumulativeDocumentsDeleted = sql`coalesce(${syncState.cumulativeDocumentsDeleted}, 0) + ${increments.documentsDeleted}`;
  }
  if (increments.storageBytesReclaimed) {
    sets.cumulativeStorageBytesReclaimed = sql`coalesce(${syncState.cumulativeStorageBytesReclaimed}, 0) + ${increments.storageBytesReclaimed}`;
  }
  if (increments.groupsReviewed) {
    sets.cumulativeGroupsReviewed = sql`coalesce(${syncState.cumulativeGroupsReviewed}, 0) + ${increments.groupsReviewed}`;
  }

  if (Object.keys(sets).length === 0) return;

  db.insert(syncState)
    .values({ id: 'singleton' })
    .onConflictDoUpdate({ target: syncState.id, set: sets })
    .run();
}

export function getDocumentStats(db: AppDatabase): DocumentStats {
  // 1. Total document count
  const [{ value: totalDocuments }] = db.select({ value: count() }).from(document).all();

  // 2. OCR coverage: count documents with/without content
  const [{ withContent }] = db
    .select({ withContent: count() })
    .from(document)
    .leftJoin(documentContent, eq(document.id, documentContent.documentId))
    .where(isNotNull(documentContent.fullText))
    .all();

  const [{ withoutContent }] = db
    .select({ withoutContent: count() })
    .from(document)
    .leftJoin(documentContent, eq(document.id, documentContent.documentId))
    .where(isNull(documentContent.fullText))
    .all();

  const ocrPercentage = totalDocuments > 0 ? Math.round((withContent / totalDocuments) * 100) : 0;

  // 3. Processing status breakdown
  const [{ pending }] = db
    .select({ pending: count() })
    .from(document)
    .where(eq(document.processingStatus, 'pending'))
    .all();

  const [{ completed }] = db
    .select({ completed: count() })
    .from(document)
    .where(eq(document.processingStatus, 'completed'))
    .all();

  // 4. Correspondent distribution
  const correspondentDistribution = db
    .select({ name: document.correspondent, count: count() })
    .from(document)
    .where(isNotNull(document.correspondent))
    .groupBy(document.correspondent)
    .orderBy(desc(count()))
    .limit(20)
    .all() as { name: string; count: number }[];

  // 5. Document type distribution
  const documentTypeDistribution = db
    .select({ name: document.documentType, count: count() })
    .from(document)
    .where(isNotNull(document.documentType))
    .groupBy(document.documentType)
    .orderBy(desc(count()))
    .limit(20)
    .all() as { name: string; count: number }[];

  // 6. Tag distribution
  const tagRows = db.select({ tagsJson: document.tagsJson }).from(document).all();

  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    const tags = parseTagsJson(row.tagsJson);
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const tagDistribution = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // 7. Total storage bytes
  const [{ totalStorageBytes }] = db
    .select({ totalStorageBytes: sql<number>`coalesce(${sum(document.archiveFileSize)}, 0)` })
    .from(document)
    .all();

  // 8. Average word count
  const [{ averageWordCount }] = db
    .select({ averageWordCount: sql<number>`coalesce(${avg(documentContent.wordCount)}, 0)` })
    .from(documentContent)
    .all();

  // 9. Documents added per month
  const documentsOverTime = db
    .select({
      month: sql<string>`strftime('%Y-%m', ${document.addedDate})`.as('month'),
      count: count(),
    })
    .from(document)
    .where(isNotNull(document.addedDate))
    .groupBy(sql`strftime('%Y-%m', ${document.addedDate})`)
    .orderBy(asc(sql`strftime('%Y-%m', ${document.addedDate})`))
    .all() as { month: string; count: number }[];

  // 10. File size distribution (archive file size buckets)
  const fileSizeRows = db
    .select({
      bucket: sql<string>`CASE
        WHEN ${document.archiveFileSize} < 102400 THEN '< 100 KB'
        WHEN ${document.archiveFileSize} < 1048576 THEN '100 KB - 1 MB'
        WHEN ${document.archiveFileSize} < 10485760 THEN '1 - 10 MB'
        WHEN ${document.archiveFileSize} < 52428800 THEN '10 - 50 MB'
        ELSE '50+ MB'
      END`.as('bucket'),
      count: count(),
    })
    .from(document)
    .where(isNotNull(document.archiveFileSize))
    .groupBy(
      sql`CASE
        WHEN ${document.archiveFileSize} < 102400 THEN '< 100 KB'
        WHEN ${document.archiveFileSize} < 1048576 THEN '100 KB - 1 MB'
        WHEN ${document.archiveFileSize} < 10485760 THEN '1 - 10 MB'
        WHEN ${document.archiveFileSize} < 52428800 THEN '10 - 50 MB'
        ELSE '50+ MB'
      END`,
    )
    .all() as { bucket: string; count: number }[];

  const fileSizeBucketLabels = ['< 100 KB', '100 KB - 1 MB', '1 - 10 MB', '10 - 50 MB', '50+ MB'];
  const fileSizeMap = new Map(fileSizeRows.map((r) => [r.bucket, r.count]));
  const fileSizeDistribution = fileSizeBucketLabels.map((label) => ({
    bucket: label,
    count: fileSizeMap.get(label) ?? 0,
  }));

  // 11. Word count distribution
  const wordCountRows = db
    .select({
      bucket: sql<string>`CASE
        WHEN ${documentContent.wordCount} < 100 THEN '0 - 100'
        WHEN ${documentContent.wordCount} < 500 THEN '100 - 500'
        WHEN ${documentContent.wordCount} < 1000 THEN '500 - 1K'
        WHEN ${documentContent.wordCount} < 5000 THEN '1K - 5K'
        WHEN ${documentContent.wordCount} < 10000 THEN '5K - 10K'
        ELSE '10K+'
      END`.as('bucket'),
      count: count(),
    })
    .from(documentContent)
    .where(isNotNull(documentContent.wordCount))
    .groupBy(
      sql`CASE
        WHEN ${documentContent.wordCount} < 100 THEN '0 - 100'
        WHEN ${documentContent.wordCount} < 500 THEN '100 - 500'
        WHEN ${documentContent.wordCount} < 1000 THEN '500 - 1K'
        WHEN ${documentContent.wordCount} < 5000 THEN '1K - 5K'
        WHEN ${documentContent.wordCount} < 10000 THEN '5K - 10K'
        ELSE '10K+'
      END`,
    )
    .all() as { bucket: string; count: number }[];

  const wordCountBucketLabels = ['0 - 100', '100 - 500', '500 - 1K', '1K - 5K', '5K - 10K', '10K+'];
  const wordCountMap = new Map(wordCountRows.map((r) => [r.bucket, r.count]));
  const wordCountDistribution = wordCountBucketLabels.map((label) => ({
    bucket: label,
    count: wordCountMap.get(label) ?? 0,
  }));

  // 12. Unclassified documents
  const [{ noCorrespondent }] = db
    .select({ noCorrespondent: count() })
    .from(document)
    .where(isNull(document.correspondent))
    .all();

  const [{ noDocumentType }] = db
    .select({ noDocumentType: count() })
    .from(document)
    .where(isNull(document.documentType))
    .all();

  const [{ noTags }] = db
    .select({ noTags: count() })
    .from(document)
    .where(
      sql`${document.tagsJson} IS NULL OR ${document.tagsJson} = '' OR ${document.tagsJson} = '[]'`,
    )
    .all();

  // 13. Duplicate involvement
  const [{ documentsInGroups }] = db
    .select({
      documentsInGroups: sql<number>`COUNT(DISTINCT ${duplicateMember.documentId})`,
    })
    .from(duplicateMember)
    .all();

  const dupPercentage =
    totalDocuments > 0 ? Math.round((Number(documentsInGroups) / totalDocuments) * 100) : 0;

  // 14. Largest documents (top 10 by archive file size)
  const largestDocuments = db
    .select({
      id: document.id,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      archiveFileSize: document.archiveFileSize,
    })
    .from(document)
    .where(isNotNull(document.archiveFileSize))
    .orderBy(desc(document.archiveFileSize))
    .limit(10)
    .all() as {
    id: string;
    paperlessId: number;
    title: string;
    correspondent: string | null;
    archiveFileSize: number;
  }[];

  // 15. Cumulative usage stats
  const syncRow = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();
  const usageStats = {
    cumulativeGroupsResolved: syncRow?.cumulativeGroupsResolved ?? 0,
    cumulativeDocumentsDeleted: syncRow?.cumulativeDocumentsDeleted ?? 0,
    cumulativeStorageBytesReclaimed: syncRow?.cumulativeStorageBytesReclaimed ?? 0,
    cumulativeGroupsReviewed: syncRow?.cumulativeGroupsReviewed ?? 0,
  };

  return {
    totalDocuments,
    ocrCoverage: {
      withContent,
      withoutContent,
      percentage: ocrPercentage,
    },
    processingStatus: {
      pending,
      completed,
    },
    correspondentDistribution,
    documentTypeDistribution,
    tagDistribution,
    totalStorageBytes: Number(totalStorageBytes),
    averageWordCount: Math.round(Number(averageWordCount)),
    documentsOverTime,
    fileSizeDistribution,
    wordCountDistribution,
    unclassified: { noCorrespondent, noDocumentType, noTags },
    duplicateInvolvement: {
      documentsInGroups: Number(documentsInGroups),
      percentage: dupPercentage,
    },
    largestDocuments,
    usageStats,
  };
}
