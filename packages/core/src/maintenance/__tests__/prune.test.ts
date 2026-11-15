import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { migrateDatabase } from '../../db/migrate.js';
import { pruneExpiredReviewState } from '../prune.js';

let sqlite: Database.Database;
let directory: string;
const now = new Date('2026-01-15T12:00:00.000Z');
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'review-prune-'));
  sqlite = new Database(join(directory, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  await migrateDatabase(sqlite);
});
afterEach(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function plan(id: string, expires: string, claimed: string | null = null) {
  sqlite
    .prepare(
      `INSERT INTO reviewed_mutation_plan (id,token_hash,operation,expires_at,payload_json,claimed_by_job_id)
    VALUES (?,?,'duplicate_delete',?,'{}',?)`,
    )
    .run(id, id, expires, claimed);
  sqlite
    .prepare(
      `INSERT INTO reviewed_mutation_group_checkpoint (plan_id,group_id,ordinal) VALUES (?,'group',0)`,
    )
    .run(id);
  sqlite
    .prepare(
      `INSERT INTO reviewed_mutation_document_checkpoint
    (plan_id,group_id,document_id,paperless_id,ordinal,updated_at) VALUES (?,'group','doc',1,0,?)`,
    )
    .run(id, now.toISOString());
}
function reservation(id: string, month: string, status: string) {
  sqlite
    .prepare(
      `INSERT INTO ai_budget_reservation
    (id,dispatch_intent_id,request_key,owner_token,billing_month,model,prompt_tokens,max_output_tokens,input_per_token,output_per_token,reserved_cost_usd,status,reserved_at)
    VALUES (?,'intent',?,'owner',?,'synthetic',1,1,0,0,0,?,?)`,
    )
    .run(id, id, month, status, now.toISOString());
}
it('prunes only unclaimed plans expired more than a day ago and cascades their checkpoints', () => {
  plan('old', '2026-01-13T12:00:00.000Z');
  plan('recent', '2026-01-15T11:00:00.000Z');
  plan('boundary', '2026-01-14T12:00:00.000Z');
  plan('claimed', '2026-01-13T12:00:00.000Z', 'job');
  expect(pruneExpiredReviewState(sqlite, now)).toEqual({ plansDeleted: 1, reservationsDeleted: 0 });
  expect(sqlite.prepare('SELECT id FROM reviewed_mutation_plan ORDER BY id').all()).toEqual([
    { id: 'boundary' },
    { id: 'claimed' },
    { id: 'recent' },
  ]);
  for (const table of [
    'reviewed_mutation_group_checkpoint',
    'reviewed_mutation_document_checkpoint',
  ]) {
    expect(sqlite.prepare(`SELECT plan_id FROM ${table} ORDER BY plan_id`).all()).toEqual([
      { plan_id: 'boundary' },
      { plan_id: 'claimed' },
      { plan_id: 'recent' },
    ]);
  }
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
});
it('retains reserved rows and two billing months, including across the UTC year boundary', () => {
  reservation('old-reconciled', '2025-10', 'reconciled');
  reservation('old-abandoned', '2025-11', 'abandoned');
  reservation('old-reserved', '2025-10', 'reserved');
  reservation('previous', '2025-12', 'reconciled');
  reservation('current', '2026-01', 'reconciled');
  expect(pruneExpiredReviewState(sqlite, now)).toEqual({ plansDeleted: 0, reservationsDeleted: 2 });
  expect(sqlite.prepare('SELECT id FROM ai_budget_reservation ORDER BY id').all()).toEqual([
    { id: 'current' },
    { id: 'old-reserved' },
    { id: 'previous' },
  ]);
  expect(pruneExpiredReviewState(sqlite, now)).toEqual({ plansDeleted: 0, reservationsDeleted: 0 });
});
it('rolls back plan pruning when reservation cleanup fails', () => {
  plan('old', '2026-01-13T12:00:00.000Z');
  reservation('old', '2025-10', 'reconciled');
  sqlite.exec(
    `CREATE TRIGGER reject_prune BEFORE DELETE ON ai_budget_reservation BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;`,
  );
  expect(() => pruneExpiredReviewState(sqlite, now)).toThrow('synthetic failure');
  expect(sqlite.prepare('SELECT id FROM reviewed_mutation_plan').all()).toEqual([{ id: 'old' }]);
  expect(sqlite.prepare('SELECT plan_id FROM reviewed_mutation_document_checkpoint').all()).toEqual(
    [{ plan_id: 'old' }],
  );
});
