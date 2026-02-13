import { and, avg, count, desc, eq, isNotNull, isNull, like, sql, sum } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
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
  };
}
