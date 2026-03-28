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
    discriminativeScore: real('discriminative_score'),
    algorithmVersion: text('algorithm_version').notNull(),
    status: text('status').notNull().default('pending'),
    archivedMemberCount: integer('archived_member_count'),
    archivedPrimaryTitle: text('archived_primary_title'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_dg_confidence').on(table.confidenceScore),
    index('idx_dg_status').on(table.status),
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
    index('idx_dm_document_id').on(table.documentId),
  ],
);
