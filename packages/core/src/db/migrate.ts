import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';

import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { appConfig, syncState } from '../schema/sqlite/app.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { aiResultRevision } from '../schema/sqlite/ai-result-revisions.js';
import {
  aiBudgetReservation,
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
} from '../schema/sqlite/automation.js';
import { isSensitiveConfigKey } from '../queries/config.js';
import { ensureAutomationDefaults } from '../scheduler/settings.js';

const SCHEMA_HASH_KEY = 'schema_ddl_hash';
const SCHEMA_SNAPSHOT_KEY = 'schema_ddl_snapshot';

const allTables = {
  document,
  documentContent,
  documentSignature,
  duplicateGroup,
  duplicateMember,
  job,
  appConfig,
  syncState,
  aiProcessingResult,
  aiResultRevision,
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
  aiBudgetReservation,
};

async function generateDDL(
  storedSnapshot?: string,
): Promise<{ statements: string[]; snapshot: string }> {
  // Use createRequire for ESM compat with drizzle-kit
  const require = createRequire(import.meta.url);
  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = require('drizzle-kit/api');

  let prevSnapshot;
  if (storedSnapshot) {
    try {
      prevSnapshot = JSON.parse(storedSnapshot);
    } catch {
      console.log('[migrate] Stored schema snapshot is invalid, regenerating from scratch');
      prevSnapshot = await generateSQLiteDrizzleJson({});
    }
  } else {
    prevSnapshot = await generateSQLiteDrizzleJson({});
  }

  const currentSnapshot = await generateSQLiteDrizzleJson(allTables);

  // A released database can contain retired feature tables (for example the
  // v0.15 RAG tables) which are no longer imported by the running schema. Keep
  // them in the migration snapshot so Drizzle neither prompts for a rename nor
  // generates destructive DDL. Their data remains available for an explicit,
  // separately reviewed retirement migration.
  if (prevSnapshot?.tables) {
    for (const [tableName, table] of Object.entries(prevSnapshot.tables)) {
      if (!currentSnapshot.tables[tableName]) {
        currentSnapshot.tables[tableName] = table;
      }
    }
  }
  const migration = await generateSQLiteMigration(prevSnapshot, currentSnapshot);

  return {
    statements: migration,
    snapshot: JSON.stringify(currentSnapshot),
  };
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function migrateDatabase(sqlite: Database.Database): Promise<void> {
  // Ensure app_config table exists for storing migration state
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Connection and credential values are supplied at runtime through the
  // environment. Remove values written by older settings and import flows.
  migrateStoredCredentials(sqlite);
  migrateRetiredAiAutoApplyConfig(sqlite);

  // Pre-DDL migration: convert reviewed/resolved booleans to status enum
  migrateGroupStatus(sqlite);

  // Pre-DDL migration: consolidate cumulative usage stats columns
  migrateUsageStats(sqlite);

  // Pre-DDL migration: split 'pending' status into 'pending_review' and 'failed'
  migrateAiResultStatus(sqlite);

  // Pre-DDL migration: add discriminative_score column to duplicate_group
  migrateDiscriminativeScore(sqlite);

  // Pre-DDL migration: add archive columns for deleted duplicate groups
  migrateArchiveColumns(sqlite);

  // Pre-DDL migration: backfill appliedAt for failed AI results
  migrateFailedResultAppliedAt(sqlite);

  // Pre-DDL migration: add title-related columns to ai_processing_result
  migrateAiTitleColumns(sqlite);

  // Compatibility migration: generated DDL is skipped when a stale database
  // carries the current schema hash, so repair the durable payload column
  // explicitly before that early return can occur.
  migrateDispatchIntentTaskData(sqlite);
  migrateJobExecutionToken(sqlite);
  migrateAiAutomationCompatibility(sqlite);

  // Read stored snapshot to enable incremental migration (ALTER TABLE ADD COLUMN)
  const storedSnapshotRow = sqlite
    .prepare('SELECT value FROM app_config WHERE key = ?')
    .get(SCHEMA_SNAPSHOT_KEY) as { value: string } | undefined;

  const { statements, snapshot } = await generateDDL(storedSnapshotRow?.value);
  const currentHash = computeHash(snapshot);

  // Check if schema has already been applied
  const storedRow = sqlite
    .prepare('SELECT value FROM app_config WHERE key = ?')
    .get(SCHEMA_HASH_KEY) as { value: string } | undefined;

  if (storedRow?.value === currentHash) {
    // Schema is up to date — still run post-DDL migrations
    migrateDeletedGroupArchives(sqlite);
    ensureAutomationDefaults(sqlite);
    return;
  }

  // Apply DDL statements
  const applyStatements = sqlite.transaction(() => {
    for (const statement of statements) {
      // Convert CREATE TABLE to CREATE TABLE IF NOT EXISTS for idempotent migrations
      const safeStatement = statement
        .replace(/CREATE TABLE(?! IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS')
        .replace(/CREATE( UNIQUE)? INDEX(?! IF NOT EXISTS)/gi, 'CREATE$1 INDEX IF NOT EXISTS');
      try {
        sqlite.exec(safeStatement);
      } catch (err: unknown) {
        // ALTER TABLE ADD COLUMN fails if column already exists (snapshot out of sync)
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate column name')) {
          continue;
        }
        throw err;
      }
    }

    const now = new Date().toISOString();

    // Store schema hash
    sqlite
      .prepare(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(SCHEMA_HASH_KEY, currentHash, now);

    // Store full DDL snapshot
    sqlite
      .prepare(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(SCHEMA_SNAPSHOT_KEY, snapshot, now);
  });

  applyStatements();

  // Post-DDL migrations (require new columns to exist)
  migrateDeletedGroupArchives(sqlite);
  ensureAutomationDefaults(sqlite);
}

// ── Pre-DDL Migrations ──────────────────────────────────────────────────

function tableHasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function migrateStoredCredentials(sqlite: Database.Database): void {
  const rows = sqlite.prepare('SELECT key FROM app_config').all() as { key: string }[];
  const keys = rows.filter(({ key }) => isSensitiveConfigKey(key)).map(({ key }) => key);
  if (keys.length === 0) return;

  const remove = sqlite.prepare('DELETE FROM app_config WHERE key = ?');
  sqlite.transaction(() => {
    for (const key of keys) {
      remove.run(key);
    }
  })();
}

function migrateRetiredAiAutoApplyConfig(sqlite: Database.Database): void {
  sqlite
    .prepare(
      "DELETE FROM app_config WHERE key LIKE 'ai.autoApply%' OR key = 'ai.tagsOnlyAutoApply'",
    )
    .run();
}

/**
 * Migrate duplicate_group from reviewed/resolved booleans to single status column.
 * Maps: resolved=1 → 'deleted', reviewed=1 → 'ignored', else → 'pending'
 */
function migrateGroupStatus(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'duplicate_group', 'reviewed')) return;
  if (tableHasColumn(sqlite, 'duplicate_group', 'status')) return;

  sqlite.transaction(() => {
    sqlite.exec(`ALTER TABLE duplicate_group ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);

    sqlite.exec(`
      UPDATE duplicate_group SET status = CASE
        WHEN resolved = 1 THEN 'deleted'
        WHEN reviewed = 1 THEN 'ignored'
        ELSE 'pending'
      END
    `);

    sqlite.exec(`ALTER TABLE duplicate_group DROP COLUMN reviewed`);
    sqlite.exec(`ALTER TABLE duplicate_group DROP COLUMN resolved`);

    sqlite.exec(`DROP INDEX IF EXISTS idx_dg_status`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_dg_status ON duplicate_group(status)`);
  })();
}

/**
 * Split AI result 'pending' status into 'pending_review' (reviewable) and 'failed' (extraction errors).
 * Previously, both successful and failed extractions were stored as 'pending'.
 */
function migrateAiResultStatus(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'applied_status')) return;

  const hasPending = sqlite
    .prepare(`SELECT 1 FROM ai_processing_result WHERE applied_status = 'pending' LIMIT 1`)
    .get();
  if (!hasPending) return;

  sqlite.transaction(() => {
    sqlite.exec(`
      UPDATE ai_processing_result SET applied_status = 'failed'
      WHERE applied_status = 'pending' AND error_message IS NOT NULL
    `);
    sqlite.exec(`
      UPDATE ai_processing_result SET applied_status = 'pending_review'
      WHERE applied_status = 'pending'
    `);
  })();
}

/**
 * Consolidate cumulative_groups_resolved + cumulative_groups_reviewed into cumulative_groups_actioned.
 */
function migrateUsageStats(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'sync_state', 'cumulative_groups_resolved')) return;
  if (tableHasColumn(sqlite, 'sync_state', 'cumulative_groups_actioned')) return;

  sqlite.transaction(() => {
    sqlite.exec(`ALTER TABLE sync_state ADD COLUMN cumulative_groups_actioned INTEGER DEFAULT 0`);

    sqlite.exec(`
      UPDATE sync_state SET cumulative_groups_actioned =
        COALESCE(cumulative_groups_resolved, 0) + COALESCE(cumulative_groups_reviewed, 0)
    `);

    sqlite.exec(`ALTER TABLE sync_state DROP COLUMN cumulative_groups_resolved`);
    sqlite.exec(`ALTER TABLE sync_state DROP COLUMN cumulative_groups_reviewed`);
  })();
}

/**
 * Add discriminative_score column to duplicate_group for v1.1.0 scoring.
 * Existing groups get NULL, which the recalculation logic handles gracefully.
 */
function migrateDiscriminativeScore(sqlite: Database.Database): void {
  if (tableHasColumn(sqlite, 'duplicate_group', 'discriminative_score')) return;
  if (!tableHasColumn(sqlite, 'duplicate_group', 'confidence_score')) return;

  sqlite.exec(`ALTER TABLE duplicate_group ADD COLUMN discriminative_score REAL`);
}

/**
 * Add archive columns to duplicate_group for lightweight deleted group records.
 * Existing groups get NULL, which is correct (only populated when a group is deleted).
 */
function migrateArchiveColumns(sqlite: Database.Database): void {
  if (tableHasColumn(sqlite, 'duplicate_group', 'archived_member_count')) return;
  if (!tableHasColumn(sqlite, 'duplicate_group', 'status')) return;

  sqlite.exec(`ALTER TABLE duplicate_group ADD COLUMN archived_member_count INTEGER`);
  sqlite.exec(`ALTER TABLE duplicate_group ADD COLUMN archived_primary_title TEXT`);
  sqlite.exec(`ALTER TABLE duplicate_group ADD COLUMN deleted_at TEXT`);
}

/**
 * Backfill applied_at for failed AI results so they sort chronologically in history.
 * Previously markAiResultFailed() did not set applied_at, leaving it NULL.
 */
function migrateFailedResultAppliedAt(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'applied_at')) return;

  sqlite.exec(`
    UPDATE ai_processing_result
    SET applied_at = created_at
    WHERE applied_status = 'failed' AND applied_at IS NULL
  `);
}

/**
 * Add title-related columns to ai_processing_result for document name extraction.
 * Existing rows get NULL, which is correct (title extraction is new).
 */
function migrateAiTitleColumns(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'applied_status')) return;

  if (!tableHasColumn(sqlite, 'ai_processing_result', 'suggested_title')) {
    sqlite.exec(`ALTER TABLE ai_processing_result ADD COLUMN suggested_title TEXT`);
  }
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'current_title')) {
    sqlite.exec(`ALTER TABLE ai_processing_result ADD COLUMN current_title TEXT`);
  }
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'pre_apply_title')) {
    sqlite.exec(`ALTER TABLE ai_processing_result ADD COLUMN pre_apply_title TEXT`);
  }
  if (!tableHasColumn(sqlite, 'ai_processing_result', 'applied_title')) {
    sqlite.exec(`ALTER TABLE ai_processing_result ADD COLUMN applied_title TEXT`);
  }
}

/** Add the durable manual route-options column to old coordinator databases. */
function migrateDispatchIntentTaskData(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'dispatch_intent', 'id')) return;
  if (tableHasColumn(sqlite, 'dispatch_intent', 'task_data_json')) return;
  sqlite.exec(`ALTER TABLE dispatch_intent ADD COLUMN task_data_json TEXT`);
}

/** Add the per-launch worker ownership token even when an old hash claims current DDL. */
function migrateJobExecutionToken(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'job', 'id')) return;
  if (tableHasColumn(sqlite, 'job', 'execution_token')) return;
  sqlite.exec(`ALTER TABLE job ADD COLUMN execution_token TEXT`);
}

/** Repair Task 5 automation columns even when an obsolete hash claims current DDL. */
function migrateAiAutomationCompatibility(sqlite: Database.Database): void {
  if (tableHasColumn(sqlite, 'ai_processing_result', 'id')) {
    if (!tableHasColumn(sqlite, 'ai_processing_result', 'sync_generation_id')) {
      sqlite.exec(`ALTER TABLE ai_processing_result ADD COLUMN sync_generation_id TEXT`);
    }
  }
  if (!tableHasColumn(sqlite, 'ai_budget_reservation', 'id')) return;

  const columns = sqlite.prepare(`PRAGMA table_info('ai_budget_reservation')`).all() as {
    name: string;
    notnull: number;
  }[];
  const tableSql = (
    sqlite
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'ai_budget_reservation'`,
      )
      .get() as { sql: string }
  ).sql;
  const indexNames = new Set(
    (
      sqlite.prepare(`PRAGMA index_list('ai_budget_reservation')`).all() as {
        name: string;
      }[]
    ).map(({ name }) => name),
  );
  const requiredNotNull = new Set([
    'id',
    'dispatch_intent_id',
    'request_key',
    'owner_token',
    'billing_month',
    'model',
    'prompt_tokens',
    'max_output_tokens',
    'input_per_token',
    'output_per_token',
    'reserved_cost_usd',
    'status',
    'reserved_at',
  ]);
  const expectedColumns = [
    'id',
    'dispatch_intent_id',
    'schedule_id',
    'request_key',
    'owner_token',
    'billing_month',
    'model',
    'prompt_tokens',
    'max_output_tokens',
    'input_per_token',
    'output_per_token',
    'reserved_cost_usd',
    'actual_cost_usd',
    'status',
    'reserved_at',
    'reconciled_at',
  ];
  const isCurrent =
    columns.map(({ name }) => name).join(',') === expectedColumns.join(',') &&
    columns.every(({ name, notnull }) => !requiredNotNull.has(name) || notnull === 1) &&
    tableSql.includes('ai_budget_reservation_status_check') &&
    indexNames.has('ai_budget_reservation_request_key_unique') &&
    indexNames.has('ai_budget_reservation_dispatch_intent_idx') &&
    indexNames.has('ai_budget_reservation_month_idx');
  if (isCurrent) return;

  const has = (column: string) => columns.some(({ name }) => name === column);
  const expression = (column: string, fallback: string) => (has(column) ? column : fallback);
  const requestKey = has('request_key') ? 'COALESCE(request_key, id)' : 'id';
  const status = has('status')
    ? `CASE
         WHEN status IN ('reserved', 'reconciled', 'abandoned') THEN status
         WHEN actual_cost_usd IS NOT NULL OR reconciled_at IS NOT NULL THEN 'reconciled'
         ELSE 'reserved'
       END`
    : `CASE
         WHEN actual_cost_usd IS NOT NULL OR reconciled_at IS NOT NULL THEN 'reconciled'
         ELSE 'reserved'
       END`;

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(`
      ALTER TABLE ai_budget_reservation RENAME TO ai_budget_reservation_task2;
      CREATE TABLE \`ai_budget_reservation\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`dispatch_intent_id\` text NOT NULL,
        \`schedule_id\` text,
        \`request_key\` text NOT NULL,
        \`owner_token\` text NOT NULL,
        \`billing_month\` text NOT NULL,
        \`model\` text NOT NULL,
        \`prompt_tokens\` integer NOT NULL,
        \`max_output_tokens\` integer NOT NULL,
        \`input_per_token\` real NOT NULL,
        \`output_per_token\` real NOT NULL,
        \`reserved_cost_usd\` real NOT NULL,
        \`actual_cost_usd\` real,
        \`status\` text DEFAULT 'reserved' NOT NULL,
        \`reserved_at\` text NOT NULL,
        \`reconciled_at\` text,
        CONSTRAINT "ai_budget_reservation_status_check"
          CHECK("ai_budget_reservation"."status" IN ('reserved', 'reconciled', 'abandoned'))
      );
      INSERT INTO ai_budget_reservation (
        id, dispatch_intent_id, schedule_id, request_key, owner_token,
        billing_month, model, prompt_tokens, max_output_tokens,
        input_per_token, output_per_token, reserved_cost_usd,
        actual_cost_usd, status, reserved_at, reconciled_at
      )
      SELECT
        id,
        dispatch_intent_id,
        ${expression('schedule_id', 'NULL')},
        ${requestKey},
        ${expression('owner_token', "'legacy'")},
        billing_month,
        ${expression('model', "'unknown'")},
        ${expression('prompt_tokens', '0')},
        ${expression('max_output_tokens', '0')},
        ${expression('input_per_token', '0')},
        ${expression('output_per_token', '0')},
        reserved_cost_usd,
        ${expression('actual_cost_usd', 'NULL')},
        ${status},
        reserved_at,
        ${expression('reconciled_at', 'NULL')}
      FROM ai_budget_reservation_task2;
      DROP TABLE ai_budget_reservation_task2;
      CREATE UNIQUE INDEX \`ai_budget_reservation_request_key_unique\`
        ON \`ai_budget_reservation\` (\`request_key\`);
      CREATE INDEX \`ai_budget_reservation_dispatch_intent_idx\`
        ON \`ai_budget_reservation\` (\`dispatch_intent_id\`);
      CREATE INDEX \`ai_budget_reservation_month_idx\`
        ON \`ai_budget_reservation\` (\`schedule_id\`,\`billing_month\`);
    `);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Backfill archived fields for existing deleted groups, then strip their member rows.
 * Runs post-DDL since it requires the archived_member_count column to exist.
 * Idempotent: only touches groups where archived_member_count IS NULL.
 */
function migrateDeletedGroupArchives(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'duplicate_group', 'archived_member_count')) return;

  const unarchived = sqlite
    .prepare(
      `SELECT id FROM duplicate_group WHERE status = 'deleted' AND archived_member_count IS NULL`,
    )
    .all() as { id: string }[];

  if (unarchived.length === 0) return;

  console.log(
    `[migrate] Archiving ${unarchived.length} deleted duplicate group(s): snapshotting metadata and stripping member rows`,
  );

  const now = new Date().toISOString();

  sqlite.transaction(() => {
    for (const { id } of unarchived) {
      const memberCount = sqlite
        .prepare(`SELECT COUNT(*) as cnt FROM duplicate_member WHERE group_id = ?`)
        .get(id) as { cnt: number };

      const primaryDoc = sqlite
        .prepare(
          `SELECT d.title FROM duplicate_member dm
           JOIN document d ON dm.document_id = d.id
           WHERE dm.group_id = ? AND dm.is_primary = 1`,
        )
        .get(id) as { title: string } | undefined;

      sqlite
        .prepare(
          `UPDATE duplicate_group
           SET archived_member_count = ?, archived_primary_title = ?, deleted_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(memberCount.cnt, primaryDoc?.title ?? null, now, now, id);

      sqlite.prepare(`DELETE FROM duplicate_member WHERE group_id = ?`).run(id);
    }
  })();
}
