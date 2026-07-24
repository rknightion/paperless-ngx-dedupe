import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

/** Aggregate-only run record. OCR, document IDs and example values are never stored here. */
export const customFieldDiscoveryRun = sqliteTable(
  'custom_field_discovery_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    jobId: text('job_id').notNull().unique(),
    publicKey: text('public_key')
      .notNull()
      .$defaultFn(() => nanoid(32)),
    status: text('status').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    resultJson: text('result_json'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    uniqueIndex('custom_field_discovery_run_public_key_unique').on(table.publicKey),
    index('custom_field_discovery_run_created_at_idx').on(table.createdAt),
    index('custom_field_discovery_run_status_idx').on(table.status),
    index('custom_field_discovery_run_one_active_unique')
      .on(table.status)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);
