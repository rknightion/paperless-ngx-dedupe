import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import { document } from './documents.js';

export const duplicateGroup = sqliteTable(
  'duplicate_group',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    confidenceScore: real('confidence_score').notNull(),
    jaccardSimilarity: real('jaccard_similarity'),
    fuzzyTextRatio: real('fuzzy_text_ratio'),
    metadataSimilarity: real('metadata_similarity'),
    filenameSimilarity: real('filename_similarity'),
    algorithmVersion: text('algorithm_version').notNull(),
    reviewed: integer('reviewed', { mode: 'boolean' }).default(false),
    resolved: integer('resolved', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_dg_confidence').on(table.confidenceScore),
    index('idx_dg_status').on(table.reviewed, table.resolved),
    index('idx_dg_created').on(table.createdAt),
  ],
);

export const duplicateMember = sqliteTable(
  'duplicate_member',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    groupId: text('group_id')
      .notNull()
      .references(() => duplicateGroup.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id),
    isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  },
  (table) => [
    uniqueIndex('duplicate_member_group_document_unique').on(table.groupId, table.documentId),
  ],
);
