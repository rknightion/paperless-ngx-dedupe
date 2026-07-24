import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { createDatabaseWithHandle } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { V015_RELEASE_FIXTURE_GZIP_BASE64 } from './fixtures/v0.15.0-release.js';

const v015Fixture = gunzipSync(Buffer.from(V015_RELEASE_FIXTURE_GZIP_BASE64, 'base64')).toString(
  'utf8',
);

const automationTables = [
  'automation_schedule',
  'dispatch_intent',
  'operation_lease',
  'sync_change_generation',
  'ai_budget_reservation',
  'ai_result_revision',
] as const;

async function assertAutomationSchema(
  sqlite: ReturnType<typeof createDatabaseWithHandle>['sqlite'],
): Promise<void> {
  await migrateDatabase(sqlite);
  await migrateDatabase(sqlite);

  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string;
  }[];
  expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining([...automationTables]));

  const documentColumns = sqlite.prepare('PRAGMA table_info(document)').all() as { name: string }[];
  expect(documentColumns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      'inserted_by_sync_job_id',
      'inserted_by_sync_generation_id',
      'last_changed_by_sync_job_id',
      'last_changed_by_sync_generation_id',
    ]),
  );

  const scheduleIndexes = sqlite.prepare('PRAGMA index_list(automation_schedule)').all() as {
    name: string;
    unique: number;
  }[];
  expect(scheduleIndexes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'automation_schedule_task_unique', unique: 1 }),
    ]),
  );

  const dispatchIntentColumns = sqlite.prepare('PRAGMA table_info(dispatch_intent)').all() as {
    name: string;
  }[];
  expect(dispatchIntentColumns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(['task_data_json']),
  );

  const jobColumns = sqlite.prepare('PRAGMA table_info(job)').all() as { name: string }[];
  expect(jobColumns.map(({ name }) => name)).toEqual(expect.arrayContaining(['execution_token']));

  const revisionForeignKeys = sqlite
    .prepare('PRAGMA foreign_key_list(ai_result_revision)')
    .all() as {
    table: string;
  }[];
  expect(revisionForeignKeys).toEqual([expect.objectContaining({ table: 'ai_processing_result' })]);

  const insertIntent = sqlite.prepare(`
    INSERT INTO dispatch_intent (
      id, task, operation, trigger_kind, schedule_id, due_at, parent_job_id,
      root_schedule_id, root_due_at, status, attempt_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  const now = '2026-07-23T00:00:00.000Z';

  expect(() =>
    insertIntent.run(
      'scheduled-without-due',
      'sync',
      'sync',
      'schedule',
      'schedule-1',
      null,
      null,
      null,
      null,
      'pending',
      now,
      now,
    ),
  ).toThrow(/CHECK constraint failed/);
  expect(() =>
    insertIntent.run(
      'manual-with-lineage',
      'sync',
      'sync',
      'manual',
      'schedule-1',
      null,
      null,
      null,
      null,
      'pending',
      now,
      now,
    ),
  ).toThrow(/CHECK constraint failed/);
  expect(() =>
    insertIntent.run(
      'unknown-enum',
      'unknown',
      'unknown',
      'schedule',
      'schedule-1',
      now,
      null,
      null,
      null,
      'unknown',
      now,
      now,
    ),
  ).toThrow(/CHECK constraint failed/);

  insertIntent.run(
    'scheduled-once',
    'sync',
    'sync',
    'schedule',
    'schedule-1',
    now,
    null,
    null,
    null,
    'pending',
    now,
    now,
  );
  expect(() =>
    insertIntent.run(
      'scheduled-duplicate',
      'sync',
      'sync',
      'schedule',
      'schedule-1',
      now,
      null,
      null,
      null,
      'pending',
      now,
      now,
    ),
  ).toThrow(/UNIQUE constraint failed/);
}

describe('database migration fixtures', () => {
  it('migrates the content-free released v0.15.0 fixture twice without DDL/config drift', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    sqlite.exec(v015Fixture);
    const releasedTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(releasedTables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'ai_processing_result',
        'app_config',
        'document',
        'document_chunk',
        'document_content',
        'document_signature',
        'duplicate_group',
        'duplicate_member',
        'job',
        'rag_conversation',
        'rag_message',
        'sync_state',
      ]),
    );
    const releasedIndexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as { name: string }[];
    expect(releasedIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'ai_processing_result_document_id_unique',
        'document_content_document_id_unique',
        'document_paperless_id_unique',
        'document_signature_document_id_unique',
        'duplicate_member_group_document_unique',
        'idx_chunk_content_hash',
        'idx_chunk_document_id',
        'idx_dg_confidence',
        'idx_dg_created',
        'idx_dg_status',
        'idx_dm_document_id',
        'idx_msg_conversation_id',
      ]),
    );
    expect(
      sqlite.prepare("SELECT value FROM app_config WHERE key = 'schema_ddl_snapshot'").get(),
    ).toBeDefined();
    sqlite
      .prepare(
        "INSERT INTO app_config (key, value, updated_at) VALUES ('fixture.marker', 'keep', ?)",
      )
      .run('2026-07-23T00:00:00.000Z');

    await assertAutomationSchema(sqlite);
    const migratedTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(migratedTables.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['document_chunk', 'rag_conversation', 'rag_message']),
    );
    expect(
      sqlite.prepare("SELECT value FROM app_config WHERE key = 'fixture.marker'").get(),
    ).toEqual({
      value: 'keep',
    });
  });

  it('migrates a current database twice', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    // Simulate a current-hash database created before durable task payloads.
    // The explicit compatibility migration must repair it even when generated
    // DDL is skipped because its stored snapshot/hash claims it is current.
    sqlite.exec('ALTER TABLE dispatch_intent DROP COLUMN task_data_json');

    await assertAutomationSchema(sqlite);
  });

  it('migrates an empty database twice', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');

    await assertAutomationSchema(sqlite);
  });

  it('transactionally rebuilds a genuine Task 2 budget table to the fresh schema twice', async () => {
    const legacy = createDatabaseWithHandle(':memory:');
    legacy.sqlite.exec(`
      CREATE TABLE app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE ai_budget_reservation (
        id TEXT PRIMARY KEY NOT NULL,
        dispatch_intent_id TEXT NOT NULL,
        schedule_id TEXT,
        billing_month TEXT NOT NULL,
        reserved_cost_usd REAL NOT NULL,
        actual_cost_usd REAL,
        reserved_at TEXT NOT NULL,
        reconciled_at TEXT
      );
      CREATE UNIQUE INDEX ai_budget_reservation_dispatch_intent_id_unique
        ON ai_budget_reservation(dispatch_intent_id);
      CREATE INDEX ai_budget_reservation_month_idx
        ON ai_budget_reservation(schedule_id, billing_month);
      INSERT INTO ai_budget_reservation (
        id, dispatch_intent_id, schedule_id, billing_month,
        reserved_cost_usd, actual_cost_usd, reserved_at, reconciled_at
      ) VALUES (
        'legacy-reservation', 'legacy-intent', 'legacy-schedule', '2026-07',
        0.25, 0.2, '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z'
      );
    `);
    const fresh = createDatabaseWithHandle(':memory:');

    await migrateDatabase(fresh.sqlite);
    await migrateDatabase(legacy.sqlite);
    await migrateDatabase(legacy.sqlite);

    const signature = (sqlite: typeof legacy.sqlite) => ({
      columns: sqlite.prepare(`PRAGMA table_info('ai_budget_reservation')`).all(),
      tableSql: (
        sqlite
          .prepare(
            `SELECT sql FROM sqlite_master
             WHERE type = 'table' AND name = 'ai_budget_reservation'`,
          )
          .get() as { sql: string }
      ).sql
        .replace(/\s+/g, ' ')
        .replaceAll('`', '')
        .replaceAll('"', '')
        .trim(),
      indexes: (
        sqlite.prepare(`PRAGMA index_list('ai_budget_reservation')`).all() as {
          name: string;
          unique: number;
          origin: string;
          partial: number;
        }[]
      )
        .map((index) => ({
          ...index,
          columns: sqlite.prepare(`PRAGMA index_info('${index.name}')`).all(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      foreignKeys: sqlite.prepare(`PRAGMA foreign_key_list('ai_budget_reservation')`).all(),
    });

    expect(signature(legacy.sqlite)).toEqual(signature(fresh.sqlite));
    expect(
      legacy.sqlite
        .prepare(
          `SELECT id, request_key AS requestKey, owner_token AS ownerToken,
                  model, status, reserved_cost_usd AS reservedCostUsd,
                  actual_cost_usd AS actualCostUsd
           FROM ai_budget_reservation`,
        )
        .get(),
    ).toEqual({
      id: 'legacy-reservation',
      requestKey: 'legacy-reservation',
      ownerToken: 'legacy',
      model: 'unknown',
      status: 'reconciled',
      reservedCostUsd: 0.25,
      actualCostUsd: 0.2,
    });
    expect(() =>
      legacy.sqlite
        .prepare(
          `INSERT INTO ai_budget_reservation (
            id, dispatch_intent_id, schedule_id, request_key, owner_token,
            billing_month, model, prompt_tokens, max_output_tokens,
            input_per_token, output_per_token, reserved_cost_usd,
            status, reserved_at
          ) VALUES (
            'bad-status', 'intent-2', NULL, 'key-2', 'owner-2',
            '2026-07', 'known', 1, 1, 0.1, 0.1, 0.2,
            'invalid', '2026-07-01T00:00:00.000Z'
          )`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});
