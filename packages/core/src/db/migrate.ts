import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';

import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { appConfig, syncState } from '../schema/sqlite/app.js';

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
};

async function generateDDL(): Promise<{ statements: string[]; snapshot: string }> {
  // Use createRequire for ESM compat with drizzle-kit
  const require = createRequire(import.meta.url);
  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = require('drizzle-kit/api');

  const prevSnapshot = await generateSQLiteDrizzleJson({});
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

  const { statements, snapshot } = await generateDDL();
  const currentHash = computeHash(snapshot);

  // Check if schema has already been applied
  const storedRow = sqlite
    .prepare('SELECT value FROM app_config WHERE key = ?')
    .get(SCHEMA_HASH_KEY) as { value: string } | undefined;

  if (storedRow?.value === currentHash) {
    // Schema is up to date
    return;
  }

  // Apply DDL statements
  const applyStatements = sqlite.transaction(() => {
    for (const statement of statements) {
      // Convert CREATE TABLE to CREATE TABLE IF NOT EXISTS for idempotent migrations
      const safeStatement = statement
        .replace(/CREATE TABLE(?! IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS')
        .replace(/CREATE( UNIQUE)? INDEX(?! IF NOT EXISTS)/gi, 'CREATE$1 INDEX IF NOT EXISTS');
      sqlite.exec(safeStatement);
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
