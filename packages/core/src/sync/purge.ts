import { eq, sql } from 'drizzle-orm';
import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { syncState } from '../schema/sqlite/app.js';
import { createLogger } from '../logger.js';
import type { AppDatabase } from '../db/client.js';

export interface PurgeResult {
  documentsDeleted: number;
  groupsDeleted: number;
}

/**
 * Delete all document-related data from the local database.
 * Clears tables in FK-safe order within a transaction and resets
 * sync state fields while preserving cumulative usage counters.
 */
export function purgeAllDocumentData(db: AppDatabase): PurgeResult {
  const logger = createLogger('purge');

  const result = db.transaction((tx) => {
    // Count before deleting
    const docCount =
      tx
        .select({ count: sql<number>`count(*)` })
        .from(document)
        .get()?.count ?? 0;
    const groupCount =
      tx
        .select({ count: sql<number>`count(*)` })
        .from(duplicateGroup)
        .get()?.count ?? 0;

    // Delete in FK-safe order
    tx.delete(duplicateMember).run();
    tx.delete(duplicateGroup).run();
    tx.delete(documentSignature).run();
    tx.delete(documentContent).run();
    tx.delete(document).run();

    // Reset sync state (preserve cumulative usage counters)
    tx.update(syncState)
      .set({
        lastSyncAt: null,
        lastSyncDocumentCount: null,
        lastAnalysisAt: null,
        totalDocuments: 0,
        totalDuplicateGroups: 0,
      })
      .where(eq(syncState.id, 'singleton'))
      .run();

    return { documentsDeleted: docCount, groupsDeleted: groupCount };
  });

  logger.info(result, 'Purged all document data');
  return result;
}
