import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const automationSchedule = sqliteTable(
  'automation_schedule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    task: text('task').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    cadenceJson: text('cadence_json').notNull(),
    timezone: text('timezone').notNull(),
    nextDueAt: text('next_due_at'),
    lastClaimedDueAt: text('last_claimed_due_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('automation_schedule_task_unique').on(table.task),
    index('automation_schedule_next_due_at_idx').on(table.nextDueAt),
  ],
);

export const dispatchIntent = sqliteTable(
  'dispatch_intent',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    task: text('task').notNull(),
    operation: text('operation').notNull(),
    // Nullable only for migration compatibility with pre-coordinator rows;
    // coordinator-created intents always set this durable job reference.
    jobId: text('job_id'),
    triggerKind: text('trigger_kind').notNull(),
    scheduleId: text('schedule_id'),
    dueAt: text('due_at'),
    parentJobId: text('parent_job_id'),
    rootScheduleId: text('root_schedule_id'),
    rootDueAt: text('root_due_at'),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    terminalReason: text('terminal_reason'),
    taskDataJson: text('task_data_json'),
    dispatchKey: text('dispatch_key'),
    dispatchClaimToken: text('dispatch_claim_token'),
    dispatchClaimedAt: text('dispatch_claimed_at'),
    dispatchClaimExpiresAt: text('dispatch_claim_expires_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('dispatch_intent_schedule_due_unique').on(table.scheduleId, table.dueAt),
    uniqueIndex('dispatch_intent_job_id_unique').on(table.jobId),
    uniqueIndex('dispatch_intent_dependency_parent_task_unique').on(table.parentJobId, table.task),
    index('dispatch_intent_pending_idx').on(table.status, table.nextAttemptAt),
    check(
      'dispatch_intent_task_check',
      sql`${table.task} IN (
        'sync', 'analysis', 'duplicate_delete', 'ai_processing', 'ai_apply',
        'ai_revert', 'backup', 'checkpoint', 'vacuum', 'job_cleanup'
      )`,
    ),
    check(
      'dispatch_intent_operation_check',
      sql`${table.operation} IN (
        'sync', 'analysis', 'duplicate_delete', 'ai_processing', 'ai_apply',
        'ai_revert', 'backup', 'checkpoint', 'vacuum', 'job_cleanup'
      )`,
    ),
    check(
      'dispatch_intent_status_check',
      sql`${table.status} IN ('pending', 'dispatching', 'dispatched', 'failed', 'dead_letter', 'cancelled')`,
    ),
    check(
      'dispatch_intent_trigger_lineage_check',
      sql`(
        (${table.triggerKind} = 'schedule' AND ${table.scheduleId} IS NOT NULL AND ${table.dueAt} IS NOT NULL
          AND ${table.parentJobId} IS NULL AND ${table.rootScheduleId} IS NULL AND ${table.rootDueAt} IS NULL)
        OR
        (${table.triggerKind} = 'manual' AND ${table.scheduleId} IS NULL AND ${table.dueAt} IS NULL
          AND ${table.parentJobId} IS NULL AND ${table.rootScheduleId} IS NULL AND ${table.rootDueAt} IS NULL)
        OR
        (${table.triggerKind} = 'dependency' AND ${table.scheduleId} IS NULL AND ${table.dueAt} IS NULL
          AND ${table.parentJobId} IS NOT NULL AND ${table.rootScheduleId} IS NOT NULL AND ${table.rootDueAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const operationLease = sqliteTable(
  'operation_lease',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    operation: text('operation').notNull(),
    ownerId: text('owner_id').notNull(),
    acquiredAt: text('acquired_at').notNull(),
    heartbeatAt: text('heartbeat_at'),
    expiresAt: text('expires_at'),
  },
  (table) => [uniqueIndex('operation_lease_operation_unique').on(table.operation)],
);

export const syncChangeGeneration = sqliteTable(
  'sync_change_generation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    syncJobId: text('sync_job_id').notNull(),
    rootScheduleId: text('root_schedule_id'),
    rootDueAt: text('root_due_at'),
    changedAt: text('changed_at'),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    uniqueIndex('sync_change_generation_sync_job_id_unique').on(table.syncJobId),
    index('sync_change_generation_status_idx').on(table.status),
  ],
);

export const aiBudgetReservation = sqliteTable(
  'ai_budget_reservation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    dispatchIntentId: text('dispatch_intent_id').notNull(),
    scheduleId: text('schedule_id'),
    requestKey: text('request_key').notNull(),
    ownerToken: text('owner_token').notNull(),
    billingMonth: text('billing_month').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    maxOutputTokens: integer('max_output_tokens').notNull(),
    inputPerToken: real('input_per_token').notNull(),
    outputPerToken: real('output_per_token').notNull(),
    reservedCostUsd: real('reserved_cost_usd').notNull(),
    actualCostUsd: real('actual_cost_usd'),
    status: text('status').notNull().default('reserved'),
    reservedAt: text('reserved_at').notNull(),
    reconciledAt: text('reconciled_at'),
  },
  (table) => [
    uniqueIndex('ai_budget_reservation_request_key_unique').on(table.requestKey),
    index('ai_budget_reservation_dispatch_intent_idx').on(table.dispatchIntentId),
    index('ai_budget_reservation_month_idx').on(table.scheduleId, table.billingMonth),
    check(
      'ai_budget_reservation_status_check',
      sql`${table.status} IN ('reserved', 'reconciled', 'abandoned')`,
    ),
  ],
);
