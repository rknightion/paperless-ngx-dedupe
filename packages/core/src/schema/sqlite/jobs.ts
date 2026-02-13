import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const job = sqliteTable('job', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  type: text('type').notNull(),
  status: text('status').default('pending'),
  progress: real('progress').default(0),
  progressMessage: text('progress_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  errorMessage: text('error_message'),
  resultJson: text('result_json'),
  createdAt: text('created_at').notNull(),
});
