import { and, asc, avg, count, desc, eq, isNotNull, isNull, like, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { syncState } from '../schema/sqlite/app.js';
import { GROUP_STATUS_VALUES } from '../types/enums.js';
import type { GroupStatus } from '../types/enums.js';
import { parseTagsJson } from './helpers.js';
import type {
  DocumentLibraryCounts,
  DocumentLibraryItem,
  DocumentLibraryPage,
  DocumentLibraryQuery,
  DocumentFilters,
  DocumentStats,
  DocumentSummary,
  DocumentDetail,
  PaginatedResult,
  PaginationParams,
} from './types.js';
import { decodeDocumentLibraryCursor, encodeDocumentLibraryCursor } from './types.js';

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export const documentLibraryAddedDateKeySql = `CASE
  WHEN d.added_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
    AND date(substr(d.added_date, 1, 10)) = substr(d.added_date, 1, 10)
    AND (
      length(d.added_date) = 10
      OR (
        substr(d.added_date, 12, 2) BETWEEN '00' AND '23'
        AND (
          d.added_date GLOB '????-??-??T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
          OR d.added_date GLOB '????-??-??T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].?*Z'
          OR (
            (
              d.added_date GLOB '????-??-??T[0-2][0-9]:[0-5][0-9]:[0-5][0-9][+-][0-2][0-9]:[0-5][0-9]'
              OR d.added_date GLOB '????-??-??T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].?*[+-][0-2][0-9]:[0-5][0-9]'
            )
            AND CAST(substr(d.added_date, -5, 2) AS INTEGER) BETWEEN 0 AND 14
            AND (
              CAST(substr(d.added_date, -5, 2) AS INTEGER) < 14
              OR substr(d.added_date, -2, 2) = '00'
            )
          )
        )
      )
    )
    AND (
      strftime('%Y-%m-%dT%H:%M:%fZ', d.added_date)
        GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[01][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
      OR strftime('%Y-%m-%dT%H:%M:%fZ', d.added_date)
        GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T2[0-3]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    )
  THEN coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', d.added_date), '')
  ELSE ''
END`;

function buildDocumentLibraryWhere(query: DocumentLibraryQuery): {
  clauses: string[];
  parameters: unknown[];
} {
  const clauses: string[] = [];
  const parameters: unknown[] = [];

  if (query.text) {
    clauses.push(`(
      lower(d.title) LIKE ? ESCAPE '\\'
      OR lower(coalesce(d.correspondent, '')) LIKE ? ESCAPE '\\'
      OR lower(coalesce(d.document_type, '')) LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM document_content search_content
        WHERE search_content.document_id = d.id
          AND lower(coalesce(search_content.full_text, '')) LIKE ? ESCAPE '\\'
      )
    )`);
    const pattern = `%${escapeLike(query.text.toLowerCase())}%`;
    parameters.push(pattern, pattern, pattern, pattern);
  }
  if (query.missingOcr !== undefined) {
    const hasOcr = `EXISTS (
      SELECT 1
      FROM document_content ocr_content
      WHERE ocr_content.document_id = d.id
        AND length(trim(coalesce(ocr_content.full_text, ''))) > 0
    )`;
    clauses.push(query.missingOcr ? `NOT ${hasOcr}` : hasOcr);
  }
  if (query.missingCorrespondent !== undefined) {
    clauses.push(
      query.missingCorrespondent
        ? "length(trim(coalesce(d.correspondent, ''))) = 0"
        : "length(trim(coalesce(d.correspondent, ''))) > 0",
    );
  }
  if (query.missingDocumentType !== undefined) {
    clauses.push(
      query.missingDocumentType
        ? "length(trim(coalesce(d.document_type, ''))) = 0"
        : "length(trim(coalesce(d.document_type, ''))) > 0",
    );
  }
  if (query.missingTags !== undefined) {
    const hasTags = `CASE WHEN json_valid(d.tags_json)
      THEN json_type(d.tags_json) = 'array' AND EXISTS (
        SELECT 1 FROM json_each(d.tags_json) classification_tag
        WHERE classification_tag.type = 'text'
          AND length(trim(classification_tag.value)) > 0
      )
      ELSE 0 END`;
    clauses.push(query.missingTags ? `NOT (${hasTags})` : `(${hasTags})`);
  }
  if (query.correspondent) {
    clauses.push('d.correspondent = ?');
    parameters.push(query.correspondent);
  }
  if (query.correspondentSet) {
    clauses.push(`d.correspondent IN (${query.correspondentSet.map(() => '?').join(', ')})`);
    parameters.push(...query.correspondentSet);
  }
  if (query.documentType) {
    clauses.push('d.document_type = ?');
    parameters.push(query.documentType);
  }
  if (query.documentTypeSet) {
    clauses.push(`d.document_type IN (${query.documentTypeSet.map(() => '?').join(', ')})`);
    parameters.push(...query.documentTypeSet);
  }
  if (query.tag) {
    clauses.push(`json_valid(coalesce(d.tags_json, '[]'))
      AND EXISTS (
        SELECT 1 FROM json_each(d.tags_json) tag_value WHERE tag_value.value = ?
      )`);
    parameters.push(query.tag);
  }
  if (query.tagSet) {
    clauses.push(`json_valid(coalesce(d.tags_json, '[]'))
      AND EXISTS (
        SELECT 1 FROM json_each(d.tags_json) tag_set_value
        WHERE tag_set_value.type = 'text'
          AND tag_set_value.value IN (${query.tagSet.map(() => '?').join(', ')})
      )`);
    parameters.push(...query.tagSet);
  }
  if (query.customFieldId !== undefined) {
    let valuePredicate = '';
    const valueParameters: unknown[] = [];
    const value = query.customFieldValue;
    if (value === null) {
      valuePredicate = "AND json_type(custom_field.value, '$.value') = 'null'";
    } else if (typeof value === 'string') {
      valuePredicate =
        "AND json_type(custom_field.value, '$.value') = 'text' AND json_extract(custom_field.value, '$.value') = ?";
      valueParameters.push(value);
    } else if (typeof value === 'number') {
      valuePredicate =
        "AND json_type(custom_field.value, '$.value') IN ('integer', 'real') AND json_extract(custom_field.value, '$.value') = ?";
      valueParameters.push(value);
    } else if (typeof value === 'boolean') {
      valuePredicate = `AND json_type(custom_field.value, '$.value') = '${
        value ? 'true' : 'false'
      }'`;
    } else if (Array.isArray(value)) {
      valuePredicate =
        "AND json_type(custom_field.value, '$.value') = 'array' AND json(json_extract(custom_field.value, '$.value')) = json(?)";
      valueParameters.push(JSON.stringify(value));
    }
    clauses.push(`json_valid(coalesce(d.custom_fields_json, '[]'))
      AND EXISTS (
        SELECT 1
        FROM json_each(d.custom_fields_json) custom_field
        WHERE json_extract(custom_field.value, '$.field') = ?
          ${valuePredicate}
      )`);
    parameters.push(query.customFieldId, ...valueParameters);
  }
  if (query.duplicate === 'involved') {
    clauses.push(
      'EXISTS (SELECT 1 FROM duplicate_member duplicate_filter WHERE duplicate_filter.document_id = d.id)',
    );
  } else if (query.duplicate === 'not-involved') {
    clauses.push(
      'NOT EXISTS (SELECT 1 FROM duplicate_member duplicate_filter WHERE duplicate_filter.document_id = d.id)',
    );
  }
  if (query.aiStatus === 'unprocessed') {
    clauses.push(
      'NOT EXISTS (SELECT 1 FROM ai_processing_result ai_filter WHERE ai_filter.document_id = d.id)',
    );
  } else if (query.aiStatus) {
    clauses.push(
      'EXISTS (SELECT 1 FROM ai_processing_result ai_filter WHERE ai_filter.document_id = d.id AND ai_filter.applied_status = ?)',
    );
    parameters.push(query.aiStatus);
  }
  if (query.freshness) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM ai_processing_result freshness_filter
      WHERE freshness_filter.document_id = d.id
        AND freshness_filter.sync_generation_id ${
          query.freshness === 'fresh' ? 'IS' : 'IS NOT'
        } d.last_changed_by_sync_generation_id
    )`);
  }

  return { clauses, parameters };
}

type DocumentLibrarySqlRow = {
  id: string;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tagsJson: string | null;
  createdDate: string | null;
  addedDate: string | null;
  processingStatus: string | null;
  hasOcr: number;
  duplicateGroupCount: number;
  duplicateGroupJson: string | null;
  aiStatus: string | null;
  aiFailureType: string | null;
  aiFreshness: 'fresh' | 'stale' | null;
};

function parseRelevantDuplicateGroup(value: string | null): {
  duplicateGroupId: string | null;
  duplicateGroupStatus: GroupStatus | null;
} {
  if (!value) return { duplicateGroupId: null, duplicateGroupStatus: null };

  try {
    const parsed = JSON.parse(value) as { id?: unknown; status?: unknown };
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.status !== 'string' ||
      !GROUP_STATUS_VALUES.includes(parsed.status as GroupStatus)
    ) {
      return { duplicateGroupId: null, duplicateGroupStatus: null };
    }
    return {
      duplicateGroupId: parsed.id,
      duplicateGroupStatus: parsed.status as GroupStatus,
    };
  } catch {
    return { duplicateGroupId: null, duplicateGroupStatus: null };
  }
}

export function listDocumentLibrary(
  db: AppDatabase,
  query: DocumentLibraryQuery,
): DocumentLibraryPage {
  const base = buildDocumentLibraryWhere(query);
  const baseWhere = base.clauses.length > 0 ? `WHERE ${base.clauses.join(' AND ')}` : '';

  const countRow = db.$client
    .prepare(
      `SELECT
        count(*) AS total,
        coalesce(sum(CASE WHEN NOT EXISTS (
          SELECT 1 FROM document_content count_content
          WHERE count_content.document_id = d.id
            AND length(trim(coalesce(count_content.full_text, ''))) > 0
        ) THEN 1 ELSE 0 END), 0) AS missingOcr,
        coalesce(sum(CASE WHEN EXISTS (
          SELECT 1 FROM duplicate_member count_duplicate
          WHERE count_duplicate.document_id = d.id
        ) THEN 1 ELSE 0 END), 0) AS duplicateInvolved,
        coalesce(sum(CASE WHEN NOT EXISTS (
          SELECT 1 FROM ai_processing_result count_ai
          WHERE count_ai.document_id = d.id
        ) THEN 1 ELSE 0 END), 0) AS aiUnprocessed,
        coalesce(sum(CASE WHEN EXISTS (
          SELECT 1 FROM ai_processing_result count_stale_ai
          WHERE count_stale_ai.document_id = d.id
            AND count_stale_ai.sync_generation_id IS NOT d.last_changed_by_sync_generation_id
        ) THEN 1 ELSE 0 END), 0) AS aiStale
      FROM document d
      ${baseWhere}`,
    )
    .get(...base.parameters) as DocumentLibraryCounts;

  const page = listDocumentLibraryRows(db, query);

  return {
    ...page,
    counts: {
      total: Number(countRow.total),
      missingOcr: Number(countRow.missingOcr),
      duplicateInvolved: Number(countRow.duplicateInvolved),
      aiUnprocessed: Number(countRow.aiUnprocessed),
      aiStale: Number(countRow.aiStale),
    },
    query,
  };
}

export function listDocumentLibraryRows(
  db: AppDatabase,
  query: DocumentLibraryQuery,
): Pick<DocumentLibraryPage, 'items' | 'nextCursor'> {
  const base = buildDocumentLibraryWhere(query);
  const rowClauses = [...base.clauses];
  const rowParameters = [...base.parameters];
  if (query.cursor) {
    const cursor = decodeDocumentLibraryCursor(query.cursor);
    if (!cursor) {
      // The schema already validates this. Keep the guard local so this
      // function remains safe if validation changes independently.
      throw new Error('Invalid document library cursor');
    }
    rowClauses.push(
      `(${documentLibraryAddedDateKeySql} < ? OR (${documentLibraryAddedDateKeySql} = ? AND d.paperless_id < ?))`,
    );
    const cursorDate = cursor.addedDate ?? '';
    rowParameters.push(cursorDate, cursorDate, cursor.paperlessId);
  }
  const rowWhere = rowClauses.length > 0 ? `WHERE ${rowClauses.join(' AND ')}` : '';

  const rows = db.$client
    .prepare(
      `SELECT
        d.id,
        d.paperless_id AS paperlessId,
        d.title,
        d.correspondent,
        d.document_type AS documentType,
        d.tags_json AS tagsJson,
        d.created_date AS createdDate,
        nullif(${documentLibraryAddedDateKeySql}, '') AS addedDate,
        d.processing_status AS processingStatus,
        EXISTS (
          SELECT 1 FROM document_content item_content
          WHERE item_content.document_id = d.id
            AND length(trim(coalesce(item_content.full_text, ''))) > 0
        ) AS hasOcr,
        (
          SELECT count(*) FROM duplicate_member item_duplicate
          WHERE item_duplicate.document_id = d.id
        ) AS duplicateGroupCount,
        (
          SELECT json_object('id', relevant_group.id, 'status', relevant_group.status)
          FROM duplicate_member relevant_member
          JOIN duplicate_group relevant_group ON relevant_group.id = relevant_member.group_id
          WHERE relevant_member.document_id = d.id
          ORDER BY
            CASE WHEN relevant_group.status = 'pending' THEN 0 ELSE 1 END,
            relevant_group.updated_at DESC,
            relevant_group.id DESC
          LIMIT 1
        ) AS duplicateGroupJson,
        item_ai.applied_status AS aiStatus,
        item_ai.failure_type AS aiFailureType,
        CASE
          WHEN item_ai.id IS NULL THEN NULL
          WHEN item_ai.sync_generation_id IS d.last_changed_by_sync_generation_id THEN 'fresh'
          ELSE 'stale'
        END AS aiFreshness
      FROM document d
      LEFT JOIN ai_processing_result item_ai ON item_ai.document_id = d.id
      ${rowWhere}
      ORDER BY ${documentLibraryAddedDateKeySql} DESC, d.paperless_id DESC
      LIMIT ?`,
    )
    .all(...rowParameters, query.limit + 1) as DocumentLibrarySqlRow[];

  const hasNextPage = rows.length > query.limit;
  const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows;
  const items: DocumentLibraryItem[] = visibleRows.map((row) => ({
    id: row.id,
    paperlessId: row.paperlessId,
    title: row.title,
    correspondent: row.correspondent,
    documentType: row.documentType,
    tags: parseTagsJson(row.tagsJson),
    createdDate: row.createdDate,
    addedDate: row.addedDate,
    processingStatus: row.processingStatus,
    hasOcr: row.hasOcr === 1,
    duplicateGroupCount: row.duplicateGroupCount,
    ...parseRelevantDuplicateGroup(row.duplicateGroupJson),
    aiStatus: row.aiStatus,
    aiFailureType: row.aiFailureType,
    aiFreshness: row.aiFreshness,
  }));
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasNextPage && last
        ? encodeDocumentLibraryCursor({
            addedDate: last.addedDate,
            paperlessId: last.paperlessId,
          })
        : null,
  };
}

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
  if (filters.noAiResult) {
    return getDocumentsWithoutAiResult(db, filters, pagination);
  }

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
  }));

  return { items, total, limit: pagination.limit, offset: pagination.offset };
}

function getDocumentsWithoutAiResult(
  db: AppDatabase,
  filters: DocumentFilters,
  pagination: PaginationParams,
): PaginatedResult<DocumentSummary> {
  const baseConditions = buildDocumentWhere(filters);

  const totalResult = db
    .select({ value: count() })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(and(baseConditions, isNull(aiProcessingResult.id)))
    .all();
  const total = totalResult[0]?.value ?? 0;

  const rows = db
    .select({
      id: document.id,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
      createdDate: document.createdDate,
      addedDate: document.addedDate,
      processingStatus: document.processingStatus,
    })
    .from(document)
    .leftJoin(aiProcessingResult, eq(document.id, aiProcessingResult.documentId))
    .where(and(baseConditions, isNull(aiProcessingResult.id)))
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
      status: duplicateGroup.status,
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
      status: m.status,
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
    groupsActioned?: number;
    documentsDeleted?: number;
  },
): void {
  const sets: Record<string, unknown> = {};

  if (increments.groupsActioned) {
    sets.cumulativeGroupsActioned = sql`coalesce(${syncState.cumulativeGroupsActioned}, 0) + ${increments.groupsActioned}`;
  }
  if (increments.documentsDeleted) {
    sets.cumulativeDocumentsDeleted = sql`coalesce(${syncState.cumulativeDocumentsDeleted}, 0) + ${increments.documentsDeleted}`;
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

  // 7. Average word count
  const [{ averageWordCount }] = db
    .select({ averageWordCount: sql<number>`coalesce(${avg(documentContent.wordCount)}, 0)` })
    .from(documentContent)
    .all();

  // 8. Documents added per month
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

  // 9. Word count distribution
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

  // 10. Unclassified documents
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

  // 11. Duplicate involvement
  const [{ documentsInGroups }] = db
    .select({
      documentsInGroups: sql<number>`COUNT(DISTINCT ${duplicateMember.documentId})`,
    })
    .from(duplicateMember)
    .all();

  const dupPercentage =
    totalDocuments > 0 ? Math.round((Number(documentsInGroups) / totalDocuments) * 100) : 0;

  // 12. Cumulative usage stats
  const syncRow = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();
  const usageStats = {
    cumulativeGroupsActioned: syncRow?.cumulativeGroupsActioned ?? 0,
    cumulativeDocumentsDeleted: syncRow?.cumulativeDocumentsDeleted ?? 0,
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
    averageWordCount: Math.round(Number(averageWordCount)),
    documentsOverTime,
    wordCountDistribution,
    unclassified: { noCorrespondent, noDocumentType, noTags },
    duplicateInvolvement: {
      documentsInGroups: Number(documentsInGroups),
      percentage: dupPercentage,
    },
    usageStats,
  };
}

/**
 * Delete a document and all its FK-dependent rows from the local database.
 * Order follows the FK-safe pattern from purge.ts.
 */
export function deleteDocumentLocally(db: AppDatabase, documentId: string): void {
  db.transaction((tx) => {
    tx.delete(duplicateMember).where(eq(duplicateMember.documentId, documentId)).run();
    tx.delete(documentSignature).where(eq(documentSignature.documentId, documentId)).run();
    tx.delete(documentContent).where(eq(documentContent.documentId, documentId)).run();
    tx.delete(aiProcessingResult).where(eq(aiProcessingResult.documentId, documentId)).run();
    tx.delete(document).where(eq(document.id, documentId)).run();
  });
}
