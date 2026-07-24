import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const reviewedMutationPlan = sqliteTable(
  'reviewed_mutation_plan',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    operation: text('operation').notNull(),
    expiresAt: text('expires_at').notNull(),
    payloadJson: text('payload_json').notNull(),
    consumedAt: text('consumed_at'),
    claimedByJobId: text('claimed_by_job_id'),
    claimedAt: text('claimed_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    uniqueIndex('reviewed_mutation_plan_token_hash_unique').on(table.tokenHash),
    index('reviewed_mutation_plan_expiry_idx').on(table.expiresAt),
    index('reviewed_mutation_plan_claim_idx').on(table.claimedByJobId, table.completedAt),
    check(
      'reviewed_mutation_plan_operation_check',
      sql`${table.operation} IN ('ai_apply', 'ai_revert', 'duplicate_delete')`,
    ),
  ],
);

export const reviewedMutationGroupCheckpoint = sqliteTable(
  'reviewed_mutation_group_checkpoint',
  {
    planId: text('plan_id')
      .notNull()
      .references(() => reviewedMutationPlan.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    status: text('status').notNull().default('pending'),
    conflictReason: text('conflict_reason'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    primaryKey({
      columns: [table.planId, table.groupId],
      name: 'reviewed_mutation_group_checkpoint_pk',
    }),
    uniqueIndex('reviewed_mutation_group_checkpoint_ordinal_unique').on(
      table.planId,
      table.ordinal,
    ),
    index('reviewed_mutation_group_checkpoint_status_idx').on(table.planId, table.status),
    check('reviewed_mutation_group_checkpoint_ordinal_check', sql`${table.ordinal} >= 0`),
    check(
      'reviewed_mutation_group_checkpoint_status_check',
      sql`${table.status} IN ('pending', 'in_progress', 'completed', 'conflict', 'failed')`,
    ),
    check(
      'reviewed_mutation_group_checkpoint_conflict_check',
      sql`${table.conflictReason} IS NULL OR ${table.conflictReason} IN ('missing', 'changed')`,
    ),
  ],
);

export const reviewedMutationDocumentCheckpoint = sqliteTable(
  'reviewed_mutation_document_checkpoint',
  {
    planId: text('plan_id').notNull(),
    groupId: text('group_id').notNull(),
    documentId: text('document_id').notNull(),
    paperlessId: integer('paperless_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    status: text('status').notNull().default('pending'),
    outcome: text('outcome'),
    attemptCount: integer('attempt_count').notNull().default(0),
    retryable: integer('retryable', { mode: 'boolean' }),
    startedAt: text('started_at'),
    remoteDeletedAt: text('remote_deleted_at'),
    reconciledAt: text('reconciled_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.planId, table.groupId, table.documentId],
      name: 'reviewed_mutation_document_checkpoint_pk',
    }),
    foreignKey({
      columns: [table.planId, table.groupId],
      foreignColumns: [
        reviewedMutationGroupCheckpoint.planId,
        reviewedMutationGroupCheckpoint.groupId,
      ],
      name: 'reviewed_mutation_document_checkpoint_group_fk',
    }).onDelete('cascade'),
    uniqueIndex('reviewed_mutation_document_checkpoint_ordinal_unique').on(
      table.planId,
      table.groupId,
      table.ordinal,
    ),
    index('reviewed_mutation_document_checkpoint_status_idx').on(table.planId, table.status),
    check(
      'reviewed_mutation_document_checkpoint_paperless_id_check',
      sql`${table.paperlessId} >= 0`,
    ),
    check('reviewed_mutation_document_checkpoint_ordinal_check', sql`${table.ordinal} >= 0`),
    check(
      'reviewed_mutation_document_checkpoint_attempt_count_check',
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      'reviewed_mutation_document_checkpoint_status_check',
      sql`${table.status} IN (
        'pending', 'delete_started', 'remote_deleted', 'delete_failed', 'reconciled'
      )`,
    ),
    check(
      'reviewed_mutation_document_checkpoint_outcome_check',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('deleted', 'already_missing')`,
    ),
    check(
      'reviewed_mutation_document_checkpoint_retryable_check',
      sql`${table.retryable} IS NULL OR ${table.retryable} IN (0, 1)`,
    ),
  ],
);
