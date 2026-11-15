import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { purgeAllDocumentData } from '../purge.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
// No current document foreign-key table is intentionally retained by purge.
const RETAINED_DOCUMENT_TABLES = new Set<string>();

beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
  const now = new Date().toISOString();
  handle.sqlite
    .prepare(
      `INSERT INTO duplicate_group
    (id, confidence_score, algorithm_version, created_at, updated_at)
    VALUES ('purge-group', 1, 'synthetic', ?, ?)`,
    )
    .run(now, now);
  for (let i = 1; i <= 2; i++) {
    const id = `purge-doc-${i}`;
    handle.sqlite
      .prepare(
        `INSERT INTO document (id, paperless_id, title, synced_at)
      VALUES (?, ?, 'Synthetic document', ?)`,
      )
      .run(id, i, now);
    handle.sqlite
      .prepare(
        `INSERT INTO document_content (id, document_id, full_text)
      VALUES (?, ?, 'Synthetic content')`,
      )
      .run(`content-${i}`, id);
    handle.sqlite
      .prepare(
        `INSERT INTO document_signature
      (id, document_id, algorithm_version, num_permutations, created_at)
      VALUES (?, ?, 'synthetic', 256, ?)`,
      )
      .run(`signature-${i}`, id, now);
    handle.sqlite
      .prepare(
        `INSERT INTO duplicate_member (id, group_id, document_id)
      VALUES (?, 'purge-group', ?)`,
      )
      .run(`member-${i}`, id);
  }
  handle.sqlite
    .prepare(
      `INSERT INTO ai_processing_result
    (id, document_id, paperless_id, provider, model, created_at)
    VALUES ('purge-result', 'purge-doc-1', 1, 'openai', 'synthetic', ?)`,
    )
    .run(now);
  handle.sqlite
    .prepare(
      `INSERT INTO sync_state
    (id, last_sync_at, last_sync_document_count, last_analysis_at, total_documents,
     total_duplicate_groups, cumulative_documents_deleted, cumulative_groups_actioned)
    VALUES ('singleton', ?, 2, ?, 2, 1, 7, 3)`,
    )
    .run(now, now);
});
afterEach(() => handle.sqlite.close());

it('removes every row that references a document', () => {
  purgeAllDocumentData(handle.db);
  const tables = handle.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  const required = new Set(['document', 'duplicate_group']);
  for (const { name } of tables) {
    const escaped = name.replaceAll('"', '""');
    const keys = handle.sqlite.prepare(`PRAGMA foreign_key_list("${escaped}")`).all() as {
      table: string;
    }[];
    if (keys.some((key) => key.table === 'document') && !RETAINED_DOCUMENT_TABLES.has(name))
      required.add(name);
  }
  for (const name of required) {
    expect(
      handle.sqlite.prepare(`SELECT count(*) AS count FROM "${name.replaceAll('"', '""')}"`).get(),
      name,
    ).toEqual({ count: 0 });
  }
  expect(handle.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('returns the counts it deleted', () => {
  expect(purgeAllDocumentData(handle.db)).toEqual({
    documentsDeleted: 2,
    groupsDeleted: 1,
    aiResultsDeleted: 1,
  });
});

it('resets sync state and keeps usage counters', () => {
  purgeAllDocumentData(handle.db);
  expect(
    handle.sqlite
      .prepare(
        `SELECT last_sync_at, last_sync_document_count, last_analysis_at,
    total_documents, total_duplicate_groups, cumulative_documents_deleted, cumulative_groups_actioned
    FROM sync_state WHERE id = 'singleton'`,
      )
      .get(),
  ).toEqual({
    last_sync_at: null,
    last_sync_document_count: null,
    last_analysis_at: null,
    total_documents: 0,
    total_duplicate_groups: 0,
    cumulative_documents_deleted: 7,
    cumulative_groups_actioned: 3,
  });
});
