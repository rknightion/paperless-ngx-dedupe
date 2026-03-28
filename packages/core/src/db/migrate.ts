import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';

import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { appConfig, syncState } from '../schema/sqlite/app.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { documentChunk, ragConversation, ragMessage } from '../schema/sqlite/rag.js';

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
  documentChunk,
  ragConversation,
  ragMessage,
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
}

// ── Pre-DDL Migrations ──────────────────────────────────────────────────

function tableHasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
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
