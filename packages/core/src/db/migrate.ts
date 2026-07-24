import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

import { document, documentContent, documentSignature } from '../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { appConfig, syncState } from '../schema/sqlite/app.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { aiResultRevision } from '../schema/sqlite/ai-result-revisions.js';
import { aiCustomFieldPolicy } from '../schema/sqlite/ai-custom-field-policy.js';
import { customFieldDiscoveryRun } from '../schema/sqlite/custom-field-discovery.js';
import {
  aiBudgetReservation,
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
} from '../schema/sqlite/automation.js';
import {
  reviewedMutationDocumentCheckpoint,
  reviewedMutationGroupCheckpoint,
  reviewedMutationPlan,
} from '../schema/sqlite/review.js';
import { isSensitiveConfigKey } from '../queries/config.js';
import { ensureAutomationDefaults } from '../scheduler/settings.js';
import { documentLibraryAddedDateKeySql } from '../queries/documents.js';

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
  aiCustomFieldPolicy,
  customFieldDiscoveryRun,
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
  aiBudgetReservation,
  reviewedMutationPlan,
  reviewedMutationGroupCheckpoint,
  reviewedMutationDocumentCheckpoint,
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
  ensureReviewedMutationCompatibility(sqlite);
  ensureJobHistoryCompatibility(sqlite);
  ensureDocumentLibraryAddedDateIndex(sqlite);
  ensureCustomFieldPolicyCompatibility(sqlite);

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
    ensureCustomFieldPolicyCompatibility(sqlite);
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
  ensureDocumentLibraryAddedDateIndex(sqlite);
  migrateDeletedGroupArchives(sqlite);
  ensureAutomationDefaults(sqlite);
  ensureCustomFieldPolicyCompatibility(sqlite);
}

// ── Pre-DDL Migrations ──────────────────────────────────────────────────

function tableHasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

const DOCUMENT_LIBRARY_ADDED_DATE_INDEX_NAME = 'document_library_added_date_paperless_idx';

function normalizeSchemaSql(value: string): string {
  return value.replaceAll('`', '').replaceAll('"', '').replace(/\s+/g, ' ').trim();
}

const CUSTOM_FIELD_POLICY_TABLE_SQL = `CREATE TABLE ai_custom_field_policy (
  field_id integer PRIMARY KEY NOT NULL,
  field_name text NOT NULL,
  data_type text NOT NULL,
  guidance text,
  updated_at text NOT NULL,
  CONSTRAINT ai_custom_field_policy_field_id_check CHECK(ai_custom_field_policy.field_id > 0),
  CONSTRAINT ai_custom_field_policy_name_check CHECK(length(ai_custom_field_policy.field_name) > 0),
  CONSTRAINT ai_custom_field_policy_type_check CHECK(ai_custom_field_policy.data_type IN (
    'string', 'url', 'date', 'boolean', 'integer', 'float', 'monetary', 'select', 'longtext'
  )),
  CONSTRAINT ai_custom_field_policy_guidance_check CHECK(
    ai_custom_field_policy.guidance IS NULL
    OR length(ai_custom_field_policy.guidance) BETWEEN 1 AND 500
  )
)`;

/**
 * Repairs policy storage independently of the generated schema hash, then
 * enforces the legacy enabled/empty invariant in the same transaction.
 */
function ensureCustomFieldPolicyCompatibility(sqlite: Database.Database): void {
  const existing = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get('ai_custom_field_policy') as { sql: string } | undefined;
  const compatible =
    existing !== undefined &&
    normalizeSchemaSql(existing.sql) === normalizeSchemaSql(CUSTOM_FIELD_POLICY_TABLE_SQL);

  sqlite.transaction(() => {
    if (!compatible) {
      if (existing) {
        sqlite.exec('ALTER TABLE ai_custom_field_policy RENAME TO legacy_ai_custom_field_policy');
      }
      sqlite.exec(CUSTOM_FIELD_POLICY_TABLE_SQL);

      if (existing) {
        const columns = new Set(
          (
            sqlite.prepare("PRAGMA table_info('legacy_ai_custom_field_policy')").all() as {
              name: string;
            }[]
          ).map(({ name }) => name),
        );
        const required = ['field_id', 'field_name', 'data_type', 'guidance', 'updated_at'];
        if (required.every((column) => columns.has(column))) {
          sqlite.exec(`
            INSERT OR IGNORE INTO ai_custom_field_policy (
              field_id, field_name, data_type, guidance, updated_at
            )
            SELECT field_id, field_name, data_type, guidance, updated_at
            FROM legacy_ai_custom_field_policy
            WHERE typeof(field_id) = 'integer'
              AND field_id > 0
              AND typeof(field_name) = 'text'
              AND length(field_name) > 0
              AND data_type IN (
                'string', 'url', 'date', 'boolean', 'integer', 'float',
                'monetary', 'select', 'longtext'
              )
              AND (guidance IS NULL OR (
                typeof(guidance) = 'text' AND length(guidance) BETWEEN 1 AND 500
              ))
              AND typeof(updated_at) = 'text'
              AND length(updated_at) > 0
            ORDER BY rowid
          `);
        }
        sqlite.exec('DROP TABLE legacy_ai_custom_field_policy');
      }
    }

    const policyExists = sqlite.prepare('SELECT 1 FROM ai_custom_field_policy LIMIT 1').get();
    if (!policyExists) {
      sqlite
        .prepare(
          `UPDATE app_config
           SET value = 'false', updated_at = ?
           WHERE key = 'ai.extractCustomFields' AND value = 'true'`,
        )
        .run(new Date().toISOString());
    }
  })();
}

function ensureDocumentLibraryAddedDateIndex(sqlite: Database.Database): void {
  if (!tableHasColumn(sqlite, 'document', 'added_date')) return;

  // SQLite does not permit qualified column names in CREATE INDEX
  // expressions. Removing only the query alias preserves the exact shared
  // CASE expression used by the keyset ORDER BY.
  const indexExpression = documentLibraryAddedDateKeySql.replaceAll('d.', '');
  const createSql = `CREATE INDEX ${DOCUMENT_LIBRARY_ADDED_DATE_INDEX_NAME}
    ON document (${indexExpression} DESC, paperless_id DESC)`;
  const existing = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(DOCUMENT_LIBRARY_ADDED_DATE_INDEX_NAME) as { sql: string } | undefined;
  if (existing && normalizeSchemaSql(existing.sql) === normalizeSchemaSql(createSql)) return;

  sqlite.transaction(() => {
    if (existing) {
      sqlite.exec(`DROP INDEX ${DOCUMENT_LIBRARY_ADDED_DATE_INDEX_NAME}`);
    }
    sqlite.exec(createSql);
  })();
}

const REVIEWED_PLAN_TABLE_SQL = `
  CREATE TABLE reviewed_mutation_plan (
    id text PRIMARY KEY NOT NULL,
    token_hash text NOT NULL,
    operation text NOT NULL,
    expires_at text NOT NULL,
    payload_json text NOT NULL,
    consumed_at text,
    claimed_by_job_id text,
    claimed_at text,
    completed_at text,
    CONSTRAINT "reviewed_mutation_plan_operation_check"
      CHECK("reviewed_mutation_plan"."operation" IN ('ai_apply', 'ai_revert', 'duplicate_delete'))
  )
`;

const REVIEWED_GROUP_CHECKPOINT_TABLE_SQL = `
  CREATE TABLE reviewed_mutation_group_checkpoint (
    plan_id text NOT NULL,
    group_id text NOT NULL,
    ordinal integer NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    conflict_reason text,
    started_at text,
    completed_at text,
    PRIMARY KEY(plan_id, group_id),
    FOREIGN KEY (plan_id) REFERENCES reviewed_mutation_plan(id)
      ON UPDATE no action ON DELETE cascade,
    CONSTRAINT "reviewed_mutation_group_checkpoint_ordinal_check" CHECK(ordinal >= 0),
    CONSTRAINT "reviewed_mutation_group_checkpoint_status_check"
      CHECK(status IN ('pending', 'in_progress', 'completed', 'conflict', 'failed')),
    CONSTRAINT "reviewed_mutation_group_checkpoint_conflict_check"
      CHECK(conflict_reason IS NULL OR conflict_reason IN ('missing', 'changed'))
  )
`;

const REVIEWED_DOCUMENT_CHECKPOINT_TABLE_SQL = `
  CREATE TABLE reviewed_mutation_document_checkpoint (
    plan_id text NOT NULL,
    group_id text NOT NULL,
    document_id text NOT NULL,
    paperless_id integer NOT NULL,
    ordinal integer NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    outcome text,
    attempt_count integer DEFAULT 0 NOT NULL,
    retryable integer,
    started_at text,
    remote_deleted_at text,
    reconciled_at text,
    updated_at text NOT NULL,
    PRIMARY KEY(plan_id, group_id, document_id),
    FOREIGN KEY (plan_id, group_id)
      REFERENCES reviewed_mutation_group_checkpoint(plan_id, group_id)
      ON UPDATE no action ON DELETE cascade,
    CONSTRAINT "reviewed_mutation_document_checkpoint_paperless_id_check"
      CHECK(paperless_id >= 0),
    CONSTRAINT "reviewed_mutation_document_checkpoint_ordinal_check" CHECK(ordinal >= 0),
    CONSTRAINT "reviewed_mutation_document_checkpoint_attempt_count_check"
      CHECK(attempt_count >= 0),
    CONSTRAINT "reviewed_mutation_document_checkpoint_status_check"
      CHECK(status IN (
        'pending', 'delete_started', 'remote_deleted', 'delete_failed', 'reconciled'
      )),
    CONSTRAINT "reviewed_mutation_document_checkpoint_outcome_check"
      CHECK(outcome IS NULL OR outcome IN ('deleted', 'already_missing')),
    CONSTRAINT "reviewed_mutation_document_checkpoint_retryable_check"
      CHECK(retryable IS NULL OR retryable IN (0, 1))
  )
`;

function tableSql(sqlite: Database.Database, table: string): string | null {
  return (
    (
      sqlite
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table) as { sql: string } | undefined
    )?.sql ?? null
  );
}

function tableColumns(sqlite: Database.Database, table: string): Set<string> {
  return new Set(
    (sqlite.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[]).map(
      ({ name }) => name,
    ),
  );
}

function createReviewedMutationTables(sqlite: Database.Database): void {
  sqlite.exec(REVIEWED_PLAN_TABLE_SQL);
  sqlite.exec(REVIEWED_GROUP_CHECKPOINT_TABLE_SQL);
  sqlite.exec(REVIEWED_DOCUMENT_CHECKPOINT_TABLE_SQL);
}

interface TableColumnSignature {
  name: string;
  type: string;
  notnull: number;
  defaultValue: string | null;
  pk: number;
}

interface ForeignKeySignature {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  onUpdate: string;
  onDelete: string;
  match: string;
}

interface ReviewedTableDefinition {
  name: string;
  createSql: string;
  columns: readonly TableColumnSignature[];
  foreignKeys: readonly ForeignKeySignature[];
}

interface IndexColumnSignature {
  name: string;
  desc: number;
  coll: string;
}

interface CompatibilityIndexDefinition {
  table: string;
  name: string;
  unique: number;
  partial: number;
  columns: readonly IndexColumnSignature[];
  createSql: string;
}

const REVIEWED_TABLE_DEFINITIONS: readonly ReviewedTableDefinition[] = [
  {
    name: 'reviewed_mutation_plan',
    createSql: REVIEWED_PLAN_TABLE_SQL,
    columns: [
      { name: 'id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 1 },
      { name: 'token_hash', type: 'TEXT', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'operation', type: 'TEXT', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'expires_at', type: 'TEXT', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'payload_json', type: 'TEXT', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'consumed_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'claimed_by_job_id', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'claimed_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'completed_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
    ],
    foreignKeys: [],
  },
  {
    name: 'reviewed_mutation_group_checkpoint',
    createSql: REVIEWED_GROUP_CHECKPOINT_TABLE_SQL,
    columns: [
      { name: 'plan_id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 1 },
      { name: 'group_id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 2 },
      { name: 'ordinal', type: 'INTEGER', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'status', type: 'TEXT', notnull: 1, defaultValue: "'pending'", pk: 0 },
      { name: 'conflict_reason', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'started_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'completed_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
    ],
    foreignKeys: [
      {
        id: 0,
        seq: 0,
        table: 'reviewed_mutation_plan',
        from: 'plan_id',
        to: 'id',
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
        match: 'NONE',
      },
    ],
  },
  {
    name: 'reviewed_mutation_document_checkpoint',
    createSql: REVIEWED_DOCUMENT_CHECKPOINT_TABLE_SQL,
    columns: [
      { name: 'plan_id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 1 },
      { name: 'group_id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 2 },
      { name: 'document_id', type: 'TEXT', notnull: 1, defaultValue: null, pk: 3 },
      { name: 'paperless_id', type: 'INTEGER', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'ordinal', type: 'INTEGER', notnull: 1, defaultValue: null, pk: 0 },
      { name: 'status', type: 'TEXT', notnull: 1, defaultValue: "'pending'", pk: 0 },
      { name: 'outcome', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'attempt_count', type: 'INTEGER', notnull: 1, defaultValue: '0', pk: 0 },
      { name: 'retryable', type: 'INTEGER', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'started_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'remote_deleted_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'reconciled_at', type: 'TEXT', notnull: 0, defaultValue: null, pk: 0 },
      { name: 'updated_at', type: 'TEXT', notnull: 1, defaultValue: null, pk: 0 },
    ],
    foreignKeys: [
      {
        id: 0,
        seq: 0,
        table: 'reviewed_mutation_group_checkpoint',
        from: 'plan_id',
        to: 'plan_id',
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
        match: 'NONE',
      },
      {
        id: 0,
        seq: 1,
        table: 'reviewed_mutation_group_checkpoint',
        from: 'group_id',
        to: 'group_id',
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
        match: 'NONE',
      },
    ],
  },
];

const COMPATIBILITY_INDEX_DEFINITIONS: readonly CompatibilityIndexDefinition[] = [
  {
    table: 'reviewed_mutation_plan',
    name: 'reviewed_mutation_plan_token_hash_unique',
    unique: 1,
    partial: 0,
    columns: [{ name: 'token_hash', desc: 0, coll: 'BINARY' }],
    createSql: `CREATE UNIQUE INDEX reviewed_mutation_plan_token_hash_unique
      ON reviewed_mutation_plan(token_hash)`,
  },
  {
    table: 'reviewed_mutation_plan',
    name: 'reviewed_mutation_plan_expiry_idx',
    unique: 0,
    partial: 0,
    columns: [{ name: 'expires_at', desc: 0, coll: 'BINARY' }],
    createSql: `CREATE INDEX reviewed_mutation_plan_expiry_idx
      ON reviewed_mutation_plan(expires_at)`,
  },
  {
    table: 'reviewed_mutation_plan',
    name: 'reviewed_mutation_plan_claim_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'claimed_by_job_id', desc: 0, coll: 'BINARY' },
      { name: 'completed_at', desc: 0, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX reviewed_mutation_plan_claim_idx
      ON reviewed_mutation_plan(claimed_by_job_id, completed_at)`,
  },
  {
    table: 'reviewed_mutation_group_checkpoint',
    name: 'reviewed_mutation_group_checkpoint_ordinal_unique',
    unique: 1,
    partial: 0,
    columns: [
      { name: 'plan_id', desc: 0, coll: 'BINARY' },
      { name: 'ordinal', desc: 0, coll: 'BINARY' },
    ],
    createSql: `CREATE UNIQUE INDEX reviewed_mutation_group_checkpoint_ordinal_unique
      ON reviewed_mutation_group_checkpoint(plan_id, ordinal)`,
  },
  {
    table: 'reviewed_mutation_group_checkpoint',
    name: 'reviewed_mutation_group_checkpoint_status_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'plan_id', desc: 0, coll: 'BINARY' },
      { name: 'status', desc: 0, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX reviewed_mutation_group_checkpoint_status_idx
      ON reviewed_mutation_group_checkpoint(plan_id, status)`,
  },
  {
    table: 'reviewed_mutation_document_checkpoint',
    name: 'reviewed_mutation_document_checkpoint_ordinal_unique',
    unique: 1,
    partial: 0,
    columns: [
      { name: 'plan_id', desc: 0, coll: 'BINARY' },
      { name: 'group_id', desc: 0, coll: 'BINARY' },
      { name: 'ordinal', desc: 0, coll: 'BINARY' },
    ],
    createSql: `CREATE UNIQUE INDEX reviewed_mutation_document_checkpoint_ordinal_unique
      ON reviewed_mutation_document_checkpoint(plan_id, group_id, ordinal)`,
  },
  {
    table: 'reviewed_mutation_document_checkpoint',
    name: 'reviewed_mutation_document_checkpoint_status_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'plan_id', desc: 0, coll: 'BINARY' },
      { name: 'status', desc: 0, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX reviewed_mutation_document_checkpoint_status_idx
      ON reviewed_mutation_document_checkpoint(plan_id, status)`,
  },
  {
    table: 'duplicate_group',
    name: 'idx_dg_inbox_order',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'status', desc: 0, coll: 'BINARY' },
      { name: 'confidence_score', desc: 1, coll: 'BINARY' },
      { name: 'created_at', desc: 1, coll: 'BINARY' },
      { name: 'id', desc: 1, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX idx_dg_inbox_order
      ON duplicate_group(status, confidence_score DESC, created_at DESC, id DESC)`,
  },
];

const JOB_HISTORY_INDEX_DEFINITIONS: readonly CompatibilityIndexDefinition[] = [
  {
    table: 'job',
    name: 'job_history_order_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'created_at', desc: 1, coll: 'BINARY' },
      { name: 'id', desc: 1, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX job_history_order_idx
      ON job(created_at DESC, id DESC)`,
  },
  {
    table: 'job',
    name: 'job_history_status_order_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'status', desc: 0, coll: 'BINARY' },
      { name: 'created_at', desc: 1, coll: 'BINARY' },
      { name: 'id', desc: 1, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX job_history_status_order_idx
      ON job(status, created_at DESC, id DESC)`,
  },
  {
    table: 'job',
    name: 'job_history_type_order_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'type', desc: 0, coll: 'BINARY' },
      { name: 'created_at', desc: 1, coll: 'BINARY' },
      { name: 'id', desc: 1, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX job_history_type_order_idx
      ON job(type, created_at DESC, id DESC)`,
  },
  {
    table: 'job',
    name: 'job_history_type_status_order_idx',
    unique: 0,
    partial: 0,
    columns: [
      { name: 'type', desc: 0, coll: 'BINARY' },
      { name: 'status', desc: 0, coll: 'BINARY' },
      { name: 'created_at', desc: 1, coll: 'BINARY' },
      { name: 'id', desc: 1, coll: 'BINARY' },
    ],
    createSql: `CREATE INDEX job_history_type_status_order_idx
      ON job(type, status, created_at DESC, id DESC)`,
  },
  {
    table: 'job',
    name: 'job_public_history_key_unique',
    unique: 1,
    partial: 0,
    columns: [{ name: 'public_history_key', desc: 0, coll: 'BINARY' }],
    createSql: `CREATE UNIQUE INDEX job_public_history_key_unique
      ON job(public_history_key)`,
  },
];

const JOB_TABLE_SQL = `CREATE TABLE \`job\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`type\` text NOT NULL,
  \`status\` text DEFAULT 'pending',
  \`progress\` real DEFAULT 0,
  \`phase_progress\` real,
  \`progress_message\` text,
  \`started_at\` text,
  \`execution_token\` text,
  \`completed_at\` text,
  \`error_message\` text,
  \`result_json\` text,
  \`trigger_kind\` text,
  \`schedule_id\` text,
  \`due_at\` text,
  \`parent_job_id\` text,
  \`root_schedule_id\` text,
  \`root_due_at\` text,
  \`attempt\` integer DEFAULT 0 NOT NULL,
  \`next_attempt_at\` text,
  \`terminal_reason\` text,
  \`created_at\` text NOT NULL,
  \`public_history_key\` text
)`;

const JOB_COLUMN_NAMES = [
  'id',
  'type',
  'status',
  'progress',
  'phase_progress',
  'progress_message',
  'started_at',
  'execution_token',
  'completed_at',
  'error_message',
  'result_json',
  'trigger_kind',
  'schedule_id',
  'due_at',
  'parent_job_id',
  'root_schedule_id',
  'root_due_at',
  'attempt',
  'next_attempt_at',
  'terminal_reason',
  'created_at',
  'public_history_key',
] as const;

const JOB_BASE_INDEX_SQL = [
  `CREATE UNIQUE INDEX job_active_type_unique
    ON job(type) WHERE status IN ('pending', 'running', 'paused')`,
  `CREATE INDEX job_next_attempt_at_idx ON job(status, next_attempt_at)`,
] as const;

function tableColumnSignature(sqlite: Database.Database, table: string): TableColumnSignature[] {
  return (
    sqlite.prepare(`PRAGMA table_info('${table}')`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[]
  ).map((column) => ({
    name: column.name,
    type: column.type.toUpperCase(),
    notnull: column.notnull,
    defaultValue: column.dflt_value,
    pk: column.pk,
  }));
}

function foreignKeySignature(sqlite: Database.Database, table: string): ForeignKeySignature[] {
  return (
    sqlite.prepare(`PRAGMA foreign_key_list('${table}')`).all() as {
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }[]
  ).map((foreignKey) => ({
    id: foreignKey.id,
    seq: foreignKey.seq,
    table: foreignKey.table,
    from: foreignKey.from,
    to: foreignKey.to,
    onUpdate: foreignKey.on_update,
    onDelete: foreignKey.on_delete,
    match: foreignKey.match,
  }));
}

function normalizeCheckExpression(expression: string): string {
  return expression
    .replaceAll('"', '')
    .replaceAll('`', '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .replace(/\s*(>=|<=|<>|=|>|<)\s*/g, '$1')
    .trim()
    .toLowerCase();
}

function checkSignatures(sql: string): { name: string | null; expression: string }[] {
  const checks: { name: string | null; expression: string }[] = [];
  const matcher = /\bCHECK\s*\(/gi;
  for (let match = matcher.exec(sql); match; match = matcher.exec(sql)) {
    const openIndex = matcher.lastIndex - 1;
    let depth = 1;
    let quote: "'" | '"' | '`' | null = null;
    let closeIndex = openIndex + 1;
    for (; closeIndex < sql.length && depth > 0; closeIndex += 1) {
      const character = sql[closeIndex];
      if (quote) {
        if (character === quote) {
          if (sql[closeIndex + 1] === quote) {
            closeIndex += 1;
          } else {
            quote = null;
          }
        }
      } else if (character === "'" || character === '"' || character === '`') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
      }
    }
    if (depth !== 0) return [];

    const prefix = sql.slice(0, match.index);
    const constraintName = prefix.match(/CONSTRAINT\s+["`]?([A-Za-z0-9_]+)["`]?\s*$/i)?.[1] ?? null;
    checks.push({
      name: constraintName,
      expression: normalizeCheckExpression(sql.slice(openIndex + 1, closeIndex - 1)),
    });
    matcher.lastIndex = closeIndex;
  }
  return checks.sort((left, right) =>
    `${left.name ?? ''}:${left.expression}`.localeCompare(
      `${right.name ?? ''}:${right.expression}`,
    ),
  );
}

function signaturesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isReviewedMutationTableCompatible(
  sqlite: Database.Database,
  definition: ReviewedTableDefinition,
): boolean {
  const sql = tableSql(sqlite, definition.name);
  return (
    sql !== null &&
    signaturesEqual(tableColumnSignature(sqlite, definition.name), definition.columns) &&
    signaturesEqual(foreignKeySignature(sqlite, definition.name), definition.foreignKeys) &&
    signaturesEqual(checkSignatures(sql), checkSignatures(definition.createSql))
  );
}

function isCompatibilityIndexValid(
  sqlite: Database.Database,
  definition: CompatibilityIndexDefinition,
): boolean {
  const index = (
    sqlite.prepare(`PRAGMA index_list('${definition.table}')`).all() as {
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }[]
  ).find(({ name }) => name === definition.name);
  if (
    !index ||
    index.unique !== definition.unique ||
    index.origin !== 'c' ||
    index.partial !== definition.partial
  ) {
    return false;
  }

  const columns = (
    sqlite.prepare(`PRAGMA index_xinfo('${definition.name}')`).all() as {
      seqno: number;
      name: string | null;
      desc: number;
      coll: string;
      key: number;
    }[]
  )
    .filter(({ key }) => key === 1)
    .sort((left, right) => left.seqno - right.seqno)
    .map(({ name, desc, coll }) => ({ name, desc, coll }));
  return signaturesEqual(columns, definition.columns);
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function repairCompatibilityIndexes(
  sqlite: Database.Database,
  definitions: readonly CompatibilityIndexDefinition[] = COMPATIBILITY_INDEX_DEFINITIONS,
): void {
  for (const definition of definitions) {
    if (!tableSql(sqlite, definition.table)) continue;
    if (isCompatibilityIndexValid(sqlite, definition)) continue;

    const existing = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(definition.name);
    if (existing) {
      sqlite.exec(`DROP INDEX ${quoteSqliteIdentifier(definition.name)}`);
    }
    sqlite.exec(definition.createSql);
  }
}

function ensureJobHistoryCompatibility(sqlite: Database.Database): void {
  if (!tableSql(sqlite, 'job')) return;
  const originalColumns = tableColumnSignature(sqlite, 'job');
  const publicKeyIndex = originalColumns.findIndex(({ name }) => name === 'public_history_key');
  const needsTableRebuild =
    publicKeyIndex !== -1 &&
    (publicKeyIndex !== JOB_COLUMN_NAMES.length - 1 ||
      !signaturesEqual(originalColumns[publicKeyIndex], {
        name: 'public_history_key',
        type: 'TEXT',
        notnull: 0,
        defaultValue: null,
        pk: 0,
      }));
  const foreignKeysEnabled = sqlite.pragma('foreign_keys', { simple: true }) === 1;
  if (needsTableRebuild && foreignKeysEnabled) sqlite.pragma('foreign_keys = OFF');

  const repair = sqlite.transaction(() => {
    if (!tableHasColumn(sqlite, 'job', 'public_history_key')) {
      sqlite.exec('ALTER TABLE job ADD COLUMN public_history_key TEXT');
    }

    const rows = sqlite
      .prepare(
        `SELECT rowid, public_history_key AS publicHistoryKey
         FROM job ORDER BY rowid`,
      )
      .all() as { rowid: number; publicHistoryKey: string | null }[];
    const accepted = new Set<string>();
    const update = sqlite.prepare('UPDATE job SET public_history_key = ? WHERE rowid = ?');
    for (const row of rows) {
      const existing = row.publicHistoryKey;
      if (existing && /^[A-Za-z0-9_-]{32}$/.test(existing) && !accepted.has(existing)) {
        accepted.add(existing);
        continue;
      }
      let replacement = nanoid(32);
      while (accepted.has(replacement)) replacement = nanoid(32);
      update.run(replacement, row.rowid);
      accepted.add(replacement);
    }

    if (needsTableRebuild) {
      const quotedColumns = JOB_COLUMN_NAMES.map(quoteSqliteIdentifier).join(', ');
      sqlite.exec('ALTER TABLE job RENAME TO malformed_job_public_history_key');
      sqlite.exec(JOB_TABLE_SQL);
      sqlite.exec(
        `INSERT INTO job (${quotedColumns})
         SELECT ${quotedColumns} FROM malformed_job_public_history_key`,
      );
      sqlite.exec('DROP TABLE malformed_job_public_history_key');
      for (const statement of JOB_BASE_INDEX_SQL) sqlite.exec(statement);
      for (const definition of JOB_HISTORY_INDEX_DEFINITIONS) {
        sqlite.exec(definition.createSql);
      }
    }

    if (
      JOB_HISTORY_INDEX_DEFINITIONS.some(
        (definition) => !isCompatibilityIndexValid(sqlite, definition),
      )
    ) {
      for (const definition of JOB_HISTORY_INDEX_DEFINITIONS) {
        sqlite.exec(`DROP INDEX IF EXISTS ${quoteSqliteIdentifier(definition.name)}`);
      }
      for (const definition of JOB_HISTORY_INDEX_DEFINITIONS) {
        sqlite.exec(definition.createSql);
      }
    }
  });

  try {
    repair();
  } finally {
    if (needsTableRebuild && foreignKeysEnabled) sqlite.pragma('foreign_keys = ON');
  }
}

function selectExpression(columns: Set<string>, name: string, fallback: string): string {
  return columns.has(name) ? `legacy.${name}` : fallback;
}

/**
 * Compatibility DDL is deliberately independent of the stored schema hash.
 * It repairs old/current-hash databases and preserves any resumable claims.
 */
function ensureReviewedMutationCompatibility(sqlite: Database.Database): void {
  const planSql = tableSql(sqlite, 'reviewed_mutation_plan');
  const groupSql = tableSql(sqlite, 'reviewed_mutation_group_checkpoint');
  const documentSql = tableSql(sqlite, 'reviewed_mutation_document_checkpoint');
  const needsTableRebuild = REVIEWED_TABLE_DEFINITIONS.some(
    (definition) => !isReviewedMutationTableCompatible(sqlite, definition),
  );

  const foreignKeysEnabled = sqlite.pragma('foreign_keys', { simple: true }) === 1;
  if (needsTableRebuild && foreignKeysEnabled) sqlite.pragma('foreign_keys = OFF');
  const rebuild = sqlite.transaction(() => {
    if (needsTableRebuild) {
      if (documentSql) {
        sqlite.exec(
          'ALTER TABLE reviewed_mutation_document_checkpoint RENAME TO legacy_reviewed_mutation_document_checkpoint',
        );
      }
      if (groupSql) {
        sqlite.exec(
          'ALTER TABLE reviewed_mutation_group_checkpoint RENAME TO legacy_reviewed_mutation_group_checkpoint',
        );
      }
      if (planSql) {
        sqlite.exec('ALTER TABLE reviewed_mutation_plan RENAME TO legacy_reviewed_mutation_plan');
      }

      createReviewedMutationTables(sqlite);
      // Renamed tables retain their explicit indexes. Repairing here moves
      // every canonical name onto the fresh table before copying rows, so the
      // unique invariants also filter malformed legacy duplicates.
      repairCompatibilityIndexes(sqlite);
    }

    if (needsTableRebuild && planSql) {
      const columns = tableColumns(sqlite, 'legacy_reviewed_mutation_plan');
      const required = ['id', 'token_hash', 'operation', 'expires_at', 'payload_json'];
      if (required.every((column) => columns.has(column))) {
        sqlite.exec(`
          INSERT OR IGNORE INTO reviewed_mutation_plan (
            id, token_hash, operation, expires_at, payload_json, consumed_at,
            claimed_by_job_id, claimed_at, completed_at
          )
          SELECT
            legacy.id, legacy.token_hash, legacy.operation, legacy.expires_at,
            legacy.payload_json,
            ${selectExpression(columns, 'consumed_at', 'NULL')},
            ${selectExpression(columns, 'claimed_by_job_id', 'NULL')},
            ${selectExpression(columns, 'claimed_at', 'NULL')},
            ${selectExpression(columns, 'completed_at', 'NULL')}
          FROM legacy_reviewed_mutation_plan AS legacy
          ORDER BY legacy.rowid
        `);
      }
    }

    if (needsTableRebuild && groupSql) {
      const columns = tableColumns(sqlite, 'legacy_reviewed_mutation_group_checkpoint');
      const required = ['plan_id', 'group_id', 'ordinal'];
      if (required.every((column) => columns.has(column))) {
        sqlite.exec(`
          INSERT OR IGNORE INTO reviewed_mutation_group_checkpoint (
            plan_id, group_id, ordinal, status, conflict_reason, started_at, completed_at
          )
          SELECT
            legacy.plan_id, legacy.group_id, legacy.ordinal,
            ${selectExpression(columns, 'status', "'pending'")},
            ${selectExpression(columns, 'conflict_reason', 'NULL')},
            ${selectExpression(columns, 'started_at', 'NULL')},
            ${selectExpression(columns, 'completed_at', 'NULL')}
          FROM legacy_reviewed_mutation_group_checkpoint AS legacy
          WHERE EXISTS (
            SELECT 1 FROM reviewed_mutation_plan AS plan
            WHERE plan.id = legacy.plan_id
          )
          ORDER BY legacy.rowid
        `);
      }
    }

    if (needsTableRebuild && documentSql) {
      const columns = tableColumns(sqlite, 'legacy_reviewed_mutation_document_checkpoint');
      const required = ['plan_id', 'group_id', 'document_id', 'paperless_id', 'ordinal'];
      if (required.every((column) => columns.has(column))) {
        sqlite.exec(`
          INSERT OR IGNORE INTO reviewed_mutation_document_checkpoint (
            plan_id, group_id, document_id, paperless_id, ordinal, status, outcome,
            attempt_count, retryable, started_at, remote_deleted_at, reconciled_at, updated_at
          )
          SELECT
            legacy.plan_id, legacy.group_id, legacy.document_id,
            legacy.paperless_id, legacy.ordinal,
            ${selectExpression(columns, 'status', "'pending'")},
            ${selectExpression(columns, 'outcome', 'NULL')},
            ${selectExpression(columns, 'attempt_count', '0')},
            ${selectExpression(columns, 'retryable', 'NULL')},
            ${selectExpression(columns, 'started_at', 'NULL')},
            ${selectExpression(columns, 'remote_deleted_at', 'NULL')},
            ${selectExpression(columns, 'reconciled_at', 'NULL')},
            ${selectExpression(columns, 'updated_at', "'1970-01-01T00:00:00.000Z'")}
          FROM legacy_reviewed_mutation_document_checkpoint AS legacy
          WHERE EXISTS (
            SELECT 1 FROM reviewed_mutation_group_checkpoint AS group_checkpoint
            WHERE group_checkpoint.plan_id = legacy.plan_id
              AND group_checkpoint.group_id = legacy.group_id
          )
          ORDER BY legacy.rowid
        `);
      }
    }

    if (needsTableRebuild) {
      if (documentSql) sqlite.exec('DROP TABLE legacy_reviewed_mutation_document_checkpoint');
      if (groupSql) sqlite.exec('DROP TABLE legacy_reviewed_mutation_group_checkpoint');
      if (planSql) sqlite.exec('DROP TABLE legacy_reviewed_mutation_plan');
    }
    repairCompatibilityIndexes(sqlite);
  });
  try {
    rebuild();
  } finally {
    if (needsTableRebuild && foreignKeysEnabled) sqlite.pragma('foreign_keys = ON');
  }
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
