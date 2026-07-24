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
});
