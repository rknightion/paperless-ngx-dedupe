import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { desc, sql } from 'drizzle-orm';
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
    primarySource: text('primary_source', { enum: ['auto', 'manual'] })
      .notNull()
      .default('auto'),
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
    index('idx_dg_inbox_order').on(
      table.status,
      desc(table.confidenceScore),
      desc(table.createdAt),
      desc(table.id),
    ),
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

export const duplicatePairDecision = sqliteTable(
  'duplicate_pair_decision',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    paperlessIdLow: integer('paperless_id_low').notNull(),
    paperlessIdHigh: integer('paperless_id_high').notNull(),
    decision: text('decision', { enum: ['not_duplicate'] }).notNull(),
    source: text('source', {
      enum: ['group_false_positive', 'member_removed', 'manual', 'import'],
    }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('duplicate_pair_decision_pair_unique').on(
      table.paperlessIdLow,
      table.paperlessIdHigh,
    ),
    check(
      'duplicate_pair_decision_order_check',
      sql`${table.paperlessIdLow} < ${table.paperlessIdHigh}`,
    ),
    check('duplicate_pair_decision_decision_check', sql`${table.decision} = 'not_duplicate'`),
    check(
      'duplicate_pair_decision_source_check',
      sql`${table.source} IN ('group_false_positive','member_removed','manual','import')`,
    ),
  ],
);
