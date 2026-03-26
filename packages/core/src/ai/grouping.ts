import { eq, sql, and } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { document } from '../schema/sqlite/documents.js';
import type { AppDatabase } from '../db/client.js';
import type { AiResultFilters } from './queries.js';

export type GroupByField =
  | 'suggestedCorrespondent'
  | 'suggestedDocumentType'
  | 'failureType'
  | 'confidenceBand';

export interface AiResultGroup {
  key: string;
  count: number;
  resultIds: string[];
}

export interface AiGroupedResults {
  groups: AiResultGroup[];
}

function buildFilterConditions(filters: AiResultFilters) {
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

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function getAiResultGroups(
  db: AppDatabase,
  groupBy: GroupByField,
  filters: AiResultFilters = {},
): AiGroupedResults {
  const where = buildFilterConditions(filters);

  if (groupBy === 'confidenceBand') {
    return getConfidenceBandGroups(db, where);
  }

  let groupColumn;
  switch (groupBy) {
    case 'suggestedCorrespondent':
      groupColumn = aiProcessingResult.suggestedCorrespondent;
      break;
    case 'suggestedDocumentType':
      groupColumn = aiProcessingResult.suggestedDocumentType;
      break;
    case 'failureType':
      groupColumn = aiProcessingResult.failureType;
      break;
    default:
      return { groups: [] };
  }

  const rows = db
    .select({
      key: groupColumn,
      count: sql<number>`count(*)`,
      ids: sql<string>`group_concat(${aiProcessingResult.id})`,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .groupBy(groupColumn)
    .orderBy(sql`count(*) desc`)
    .all();

  const groups: AiResultGroup[] = rows.map((r) => ({
    key: (r.key as string) ?? '(none)',
    count: r.count,
    resultIds: r.ids ? r.ids.split(',') : [],
  }));

  return { groups };
}

function getConfidenceBandGroups(
  db: AppDatabase,
  where: ReturnType<typeof buildFilterConditions>,
): AiGroupedResults {
  const rows = db
    .select({
      band: sql<string>`CASE
        WHEN (json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= 0.8 THEN 'high'
        WHEN (json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= 0.5 THEN 'medium'
        ELSE 'low'
      END`,
      count: sql<number>`count(*)`,
      ids: sql<string>`group_concat(${aiProcessingResult.id})`,
    })
    .from(aiProcessingResult)
    .innerJoin(document, eq(aiProcessingResult.documentId, document.id))
    .where(where)
    .groupBy(sql`1`)
    .orderBy(
      sql`CASE
      WHEN (json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= 0.8 THEN 1
      WHEN (json_extract(${aiProcessingResult.confidenceJson}, '$.correspondent') + json_extract(${aiProcessingResult.confidenceJson}, '$.documentType') + json_extract(${aiProcessingResult.confidenceJson}, '$.tags')) / 3.0 >= 0.5 THEN 2
      ELSE 3
    END`,
    )
    .all();

  const bandLabels: Record<string, string> = {
    high: 'High Confidence (>=80%)',
    medium: 'Medium Confidence (50-79%)',
    low: 'Low Confidence (<50%)',
  };

  const groups: AiResultGroup[] = rows.map((r) => ({
    key: bandLabels[r.band] ?? r.band,
    count: r.count,
    resultIds: r.ids ? r.ids.split(',') : [],
  }));

  return { groups };
}
