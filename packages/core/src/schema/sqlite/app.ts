import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appConfig = sqliteTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const syncState = sqliteTable('sync_state', {
  id: text('id').primaryKey().default('singleton'),
  lastSyncAt: text('last_sync_at'),
  lastSyncDocumentCount: integer('last_sync_document_count'),
  lastAnalysisAt: text('last_analysis_at'),
  totalDocuments: integer('total_documents').default(0),
  totalDuplicateGroups: integer('total_duplicate_groups').default(0),
  // Cumulative usage counters (survive group/document deletion)
  cumulativeGroupsResolved: integer('cumulative_groups_resolved').default(0),
  cumulativeDocumentsDeleted: integer('cumulative_documents_deleted').default(0),
  cumulativeStorageBytesReclaimed: integer('cumulative_storage_bytes_reclaimed').default(0),
  cumulativeGroupsReviewed: integer('cumulative_groups_reviewed').default(0),
});
