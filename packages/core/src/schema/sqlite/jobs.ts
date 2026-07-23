import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const job = sqliteTable(
  'job',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    type: text('type').notNull(),
    status: text('status').default('pending'),
    progress: real('progress').default(0),
    phaseProgress: real('phase_progress'),
    progressMessage: text('progress_message'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    errorMessage: text('error_message'),
    resultJson: text('result_json'),
    triggerKind: text('trigger_kind'),
    scheduleId: text('schedule_id'),
    dueAt: text('due_at'),
    parentJobId: text('parent_job_id'),
    rootScheduleId: text('root_schedule_id'),
    rootDueAt: text('root_due_at'),
    attempt: integer('attempt').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    terminalReason: text('terminal_reason'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('job_active_type_unique')
      .on(table.type)
      .where(sql`${table.status} IN ('pending', 'running', 'paused')`),
    index('job_next_attempt_at_idx').on(table.status, table.nextAttemptAt),
  ],
);
