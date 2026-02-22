import { desc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { buildGroupWhere } from '../queries/duplicates.js';
import { parseTagsJson } from '../queries/helpers.js';
import type { DuplicateGroupFilters } from '../queries/types.js';
import type { DuplicateExportRow } from './types.js';

export function getDuplicateGroupsForExport(
  db: AppDatabase,
  filters: DuplicateGroupFilters,
): DuplicateExportRow[] {
  const where = buildGroupWhere(filters);

  const rows = db
    .select({
      groupId: duplicateGroup.id,
      confidenceScore: duplicateGroup.confidenceScore,
      jaccardSimilarity: duplicateGroup.jaccardSimilarity,
      fuzzyTextRatio: duplicateGroup.fuzzyTextRatio,
      groupStatus: duplicateGroup.status,
      groupCreatedAt: duplicateGroup.createdAt,
      isPrimary: duplicateMember.isPrimary,
      documentId: duplicateMember.documentId,
      paperlessId: document.paperlessId,
      title: document.title,
      correspondent: document.correspondent,
      documentType: document.documentType,
      tagsJson: document.tagsJson,
      createdDate: document.createdDate,
      wordCount: documentContent.wordCount,
    })
    .from(duplicateGroup)
    .innerJoin(duplicateMember, eq(duplicateMember.groupId, duplicateGroup.id))
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .leftJoin(documentContent, eq(documentContent.documentId, document.id))
    .where(where)
    .orderBy(desc(duplicateGroup.confidenceScore), duplicateGroup.id)
    .all();

  return rows.map((r) => ({
    groupId: r.groupId,
    confidenceScore: r.confidenceScore,
    jaccardSimilarity: r.jaccardSimilarity,
    fuzzyTextRatio: r.fuzzyTextRatio,
    groupStatus: r.groupStatus,
    isPrimary: r.isPrimary ?? false,
    paperlessId: r.paperlessId,
    title: r.title,
    correspondent: r.correspondent,
    documentType: r.documentType,
    tags: parseTagsJson(r.tagsJson),
    createdDate: r.createdDate,
    wordCount: r.wordCount ?? null,
    groupCreatedAt: r.groupCreatedAt,
  }));
}

const CSV_HEADERS = [
  'group_id',
  'confidence_score',
  'jaccard_similarity',
  'fuzzy_text_ratio',
  'group_status',
  'is_primary',
  'paperless_id',
  'title',
  'correspondent',
  'document_type',
  'tags',
  'created_date',
  'word_count',
  'group_created_at',
];

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join('|');
  return String(value);
}

export function formatDuplicatesCsv(rows: DuplicateExportRow[]): string {
  const BOM = '\uFEFF';
  const lines: string[] = [];

  lines.push(CSV_HEADERS.join(','));

  for (const row of rows) {
    const fields = [
      row.groupId,
      row.confidenceScore,
      row.jaccardSimilarity,
      row.fuzzyTextRatio,
      row.groupStatus,
      row.isPrimary,
      row.paperlessId,
      row.title,
      row.correspondent,
      row.documentType,
      row.tags,
      row.createdDate,
      row.wordCount,
      row.groupCreatedAt,
    ];

    lines.push(fields.map((f) => escapeCsvField(formatField(f))).join(','));
  }

  return BOM + lines.join('\r\n') + '\r\n';
}
