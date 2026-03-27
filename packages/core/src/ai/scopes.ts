import { eq, and, or, isNull, ne } from 'drizzle-orm';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import type { AppDatabase } from '../db/client.js';
import {
  getPendingAiResultIds,
  getAiResultIdsByFilter,
  getDocumentIdsByAiFilter,
} from './queries.js';
import type { AiResultFilters } from './queries.js';

// ── Process Scopes ──

export type ProcessScope =
  | { type: 'new_only' }
  | { type: 'failed_only' }
  | { type: 'selected_document_ids'; documentIds: string[] }
  | { type: 'current_filter'; filters: AiResultFilters }
  | { type: 'full_reprocess' };

// ── Apply Scopes ──

export type ApplyScope =
  | { type: 'selected_result_ids'; resultIds: string[] }
  | { type: 'all_pending' }
  | { type: 'current_filter'; filters: AiResultFilters };

// ── Resolvers ──

export function getFailedDocumentIds(db: AppDatabase): string[] {
  const rows = db
    .select({ documentId: aiProcessingResult.documentId })
    .from(aiProcessingResult)
    .where(
      and(
        eq(aiProcessingResult.appliedStatus, 'failed'),
        or(
          isNull(aiProcessingResult.failureType),
          ne(aiProcessingResult.failureType, 'no_suggestions'),
        ),
      ),
    )
    .all();

  return rows.map((r) => r.documentId);
}

export function resolveProcessScope(
  db: AppDatabase,
  scope: ProcessScope,
): { reprocess: boolean; documentIds?: string[] } {
  switch (scope.type) {
    case 'new_only':
      return { reprocess: false };
    case 'failed_only':
      return { reprocess: false, documentIds: getFailedDocumentIds(db) };
    case 'selected_document_ids':
      return { reprocess: false, documentIds: scope.documentIds };
    case 'current_filter':
      return { reprocess: false, documentIds: getDocumentIdsByAiFilter(db, scope.filters) };
    case 'full_reprocess':
      return { reprocess: true };
  }
}

export function resolveResultIdsForApplyScope(db: AppDatabase, scope: ApplyScope): string[] {
  switch (scope.type) {
    case 'selected_result_ids':
      return scope.resultIds;
    case 'all_pending':
      return getPendingAiResultIds(db);
    case 'current_filter':
      return getAiResultIdsByFilter(db, scope.filters);
  }
}
