import type { AppDatabase } from '../db/client.js';
import { listDocumentLibraryRows } from '../queries/documents.js';
import type { DocumentLibraryItem, DocumentLibraryQuery } from '../queries/types.js';

const DOCUMENT_CSV_HEADERS = [
  'paperless_id',
  'title',
  'correspondent',
  'document_type',
  'tags',
  'created_date',
  'added_date',
  'processing_status',
  'has_ocr',
  'duplicate_group_count',
  'ai_status',
  'ai_freshness',
] as const;

const FORMULA_PREFIX = /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u;

function formatDocumentCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join('|');
  return String(value);
}

export function escapeDocumentCsvCell(value: unknown): string {
  const formatted = formatDocumentCsvValue(value);
  const neutralized =
    (typeof value === 'string' || Array.isArray(value)) && FORMULA_PREFIX.test(formatted)
      ? `'${formatted}`
      : formatted;

  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replaceAll('"', '""')}"` : neutralized;
}

function formatDocumentCsvRow(item: DocumentLibraryItem): string {
  return [
    item.paperlessId,
    item.title,
    item.correspondent,
    item.documentType,
    item.tags,
    item.createdDate,
    item.addedDate,
    item.processingStatus,
    item.hasOcr,
    item.duplicateGroupCount,
    item.aiStatus,
    item.aiFreshness,
  ]
    .map(escapeDocumentCsvCell)
    .join(',');
}

export function* streamDocumentLibraryCsv(
  db: AppDatabase,
  query: DocumentLibraryQuery,
): Generator<string, void, undefined> {
  let cursor = query.cursor;
  let headerPending = true;
  for (;;) {
    const page = listDocumentLibraryRows(db, { ...query, cursor, limit: 100 });
    if (headerPending) {
      headerPending = false;
      yield `\uFEFF${DOCUMENT_CSV_HEADERS.join(',')}\r\n`;
    }
    for (const item of page.items) {
      yield `${formatDocumentCsvRow(item)}\r\n`;
    }

    if (!page.nextCursor) return;
    if (page.nextCursor === cursor) {
      throw new Error('Document library cursor did not advance');
    }
    cursor = page.nextCursor;
  }
}
