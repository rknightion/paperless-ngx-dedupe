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
});
