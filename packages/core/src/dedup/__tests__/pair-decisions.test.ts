import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { purgeAllDocumentData } from '../../sync/purge.js';
import {
  pairDecisionKey,
  recordPairDecisions,
  loadSuppressedPairSet,
  listPairDecisions,
  deletePairDecision,
} from '../pair-decisions.js';

let handle: ReturnType<typeof createDatabaseWithHandle>;
beforeEach(async () => {
  handle = createDatabaseWithHandle(':memory:');
  await migrateDatabase(handle.sqlite);
});
afterEach(() => handle.sqlite.close());

it('canonicalizes unordered pairs, ignores duplicate IDs and records idempotently', () => {
  expect(pairDecisionKey(7, 3)).toBe('3|7');
  expect(pairDecisionKey(3, 7)).toBe('3|7');
  expect(recordPairDecisions(handle.db, [3, 1, 2, 3], 'manual')).toEqual({ recorded: 3 });
  expect(loadSuppressedPairSet(handle.db)).toEqual(new Set(['1|2', '1|3', '2|3']));
  expect(recordPairDecisions(handle.db, [2, 1], 'import')).toEqual({ recorded: 0 });
  expect(recordPairDecisions(handle.db, [], 'manual')).toEqual({ recorded: 0 });
  expect(recordPairDecisions(handle.db, [1, 1], 'manual')).toEqual({ recorded: 0 });
  const { items } = listPairDecisions(handle.db, { limit: 20 });
  expect(items.map((row) => row.source)).toEqual(['manual', 'manual', 'manual']);
  expect(items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it('accepts the bounded 200-ID maximum and rejects oversized or invalid IDs without writes', () => {
  expect(() => recordPairDecisions(handle.db, Array(201).fill(1), 'manual')).toThrow(RangeError);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => recordPairDecisions(handle.db, [1, invalid], 'manual')).toThrow(RangeError);
  expect(loadSuppressedPairSet(handle.db).size).toBe(0);
  expect(
    recordPairDecisions(
      handle.db,
      Array.from({ length: 200 }, (_, index) => index + 1),
      'manual',
    ),
  ).toEqual({ recorded: 19900 });
});

it('paginates date and ID ties, validates cursors and deletes only the selected decision', () => {
  const insert = handle.sqlite.prepare(
    "INSERT INTO duplicate_pair_decision (id,paperless_id_low,paperless_id_high,decision,source,created_at) VALUES (?,?,?,'not_duplicate','manual',?)",
  );
  insert.run('a', 1, 2, '2026-01-01');
  insert.run('c', 1, 3, '2026-01-01');
  insert.run('b', 1, 4, '2026-01-02');
  const first = listPairDecisions(handle.db, { limit: 2 });
  expect(first.items.map((row) => row.id)).toEqual(['b', 'c']);
  expect(first.nextCursor).toBe('c');
  const second = listPairDecisions(handle.db, { limit: 2, cursor: first.nextCursor! });
  expect(second.items.map((row) => row.id)).toEqual(['a']);
  expect(second.nextCursor).toBeNull();
  expect(listPairDecisions(handle.db, { limit: 1, cursor: 'a' })).toEqual({
    items: [],
    nextCursor: null,
  });
  for (const limit of [0, 201, 1.5, NaN])
    expect(() => listPairDecisions(handle.db, { limit })).toThrow(RangeError);
  expect(() => listPairDecisions(handle.db, { limit: 20, cursor: 'missing' })).toThrow(RangeError);
  expect(deletePairDecision(handle.db, 'c')).toBe(true);
  expect(deletePairDecision(handle.db, 'c')).toBe(false);
  expect(loadSuppressedPairSet(handle.db)).toEqual(new Set(['1|2', '1|4']));
});

it('enforces pair order, decision, source and uniqueness in SQLite', () => {
  const insert = handle.sqlite.prepare(
    'INSERT INTO duplicate_pair_decision (id,paperless_id_low,paperless_id_high,decision,source,created_at) VALUES (?,?,?,?,?,?)',
  );
  for (const [low, high, decision, source] of [
    [2, 1, 'not_duplicate', 'manual'],
    [1, 1, 'not_duplicate', 'manual'],
    [1, 2, 'duplicate', 'manual'],
    [1, 2, 'not_duplicate', 'unknown'],
  ])
    expect(() => insert.run('invalid', low, high, decision, source, '2026-01-01')).toThrow();
  insert.run('first', 1, 2, 'not_duplicate', 'manual', '2026-01-01');
  expect(() => insert.run('second', 1, 2, 'not_duplicate', 'import', '2026-01-01')).toThrow();
});

it('preserves stable Paperless pair decisions across document purge', () => {
  recordPairDecisions(handle.db, [1, 2], 'group_false_positive');
  handle.sqlite
    .prepare(
      "INSERT INTO document (id,paperless_id,title,synced_at) VALUES ('local-before',1,'Synthetic before','2026-01-01')",
    )
    .run();
  purgeAllDocumentData(handle.db);
  expect(handle.sqlite.prepare('SELECT id FROM document').all()).toEqual([]);
  expect(loadSuppressedPairSet(handle.db)).toEqual(new Set(['1|2']));
  handle.sqlite
    .prepare(
      "INSERT INTO document (id,paperless_id,title,synced_at) VALUES ('local-after',1,'Synthetic after','2026-01-01')",
    )
    .run();
  expect(loadSuppressedPairSet(handle.db)).toEqual(new Set(['1|2']));
});
