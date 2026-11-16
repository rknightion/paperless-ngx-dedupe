import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { exportDecisions, importDecisions } from '../decisions.js';

it('exports only stable review decisions and canonical Paperless pairs', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (const id of [10, 20, 30])
      sqlite
        .prepare('INSERT INTO document (id,paperless_id,title,synced_at) VALUES (?,?,?,?)')
        .run(`local-${id}`, id, 'Synthetic private title', '2024-01-01');
    for (const [id, status] of [
      ['fp', 'false_positive'],
      ['keep', 'ignored'],
      ['pending', 'pending'],
      ['deleted', 'deleted'],
    ] as const) {
      sqlite
        .prepare(
          'INSERT INTO duplicate_group (id,confidence_score,algorithm_version,status,created_at,updated_at) VALUES (?,1,?,?,?,?)',
        )
        .run(id, 'test', status, '2024-01-01', '2024-02-01');
      for (const paperlessId of id === 'keep' ? [30, 20] : [20, 10])
        sqlite
          .prepare(
            'INSERT INTO duplicate_member (id,group_id,document_id,is_primary) VALUES (?,?,?,?)',
          )
          .run(`${id}-${paperlessId}`, id, `local-${paperlessId}`, paperlessId === 20 ? 1 : 0);
    }
    sqlite
      .prepare(
        "INSERT INTO duplicate_pair_decision (id,paperless_id_low,paperless_id_high,decision,source,created_at) VALUES ('pair',40,50,'not_duplicate','manual','2024-01-01')",
      )
      .run();
    const before = sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all();
    const backup = exportDecisions(db);
    expect(backup).toEqual({
      version: 1,
      exportedAt: expect.any(String),
      groups: [
        { paperlessIds: [10, 20], status: 'false_positive', decidedAt: '2024-02-01' },
        { paperlessIds: [20, 30], status: 'ignored', decidedAt: '2024-02-01' },
      ],
      pairDecisions: [[40, 50]],
    });
    expect(Number.isFinite(Date.parse(backup.exportedAt))).toBe(true);
    expect(JSON.stringify(backup)).not.toContain('Synthetic private title');
    expect(sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(before);
  } finally {
    sqlite.close();
  }
});

it('previews and restores statuses atomically, with idempotent reimport', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (const id of [1, 2, 3])
      sqlite
        .prepare('INSERT INTO document (id,paperless_id,title,synced_at) VALUES (?,?,?,?)')
        .run(String(id), id, 'Synthetic', '2024-01-01');
    for (const [id, status, ids] of [
      ['fp', 'false_positive', [1, 2]],
      ['keep', 'ignored', [2, 3]],
    ] as const) {
      sqlite
        .prepare(
          'INSERT INTO duplicate_group (id,confidence_score,algorithm_version,status,created_at,updated_at) VALUES (?,1,?,?,?,?)',
        )
        .run(id, 'test', status, '2024-01-01', '2024-02-01');
      for (const member of ids)
        sqlite
          .prepare(
            'INSERT INTO duplicate_member (id,group_id,document_id,is_primary) VALUES (?,?,?,?)',
          )
          .run(`${id}-${member}`, id, String(member), member === ids[0] ? 1 : 0);
    }
    const backup = exportDecisions(db);
    backup.pairDecisions.push([20, 30]);
    sqlite.exec("UPDATE duplicate_group SET status='pending'");
    const before = sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all();
    const preview = importDecisions(db, backup, { dryRun: true });
    expect(preview).toEqual({ groupsMatched: 2, groupsUnmatched: 0, pairDecisionsAdded: 1 });
    expect(sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(before);
    expect(sqlite.prepare('SELECT * FROM duplicate_pair_decision').all()).toEqual([]);
    expect(importDecisions(db, backup, { dryRun: false })).toEqual(preview);
    expect(sqlite.prepare('SELECT id,status FROM duplicate_group ORDER BY id').all()).toEqual([
      { id: 'fp', status: 'false_positive' },
      { id: 'keep', status: 'ignored' },
    ]);
    const after = sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all();
    const pairs = sqlite.prepare('SELECT * FROM duplicate_pair_decision').all();
    expect(importDecisions(db, backup, { dryRun: false }).pairDecisionsAdded).toBe(0);
    expect(sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all()).toEqual(after);
    expect(sqlite.prepare('SELECT * FROM duplicate_pair_decision').all()).toEqual(pairs);
    expect(pairs).toEqual([
      expect.objectContaining({ paperless_id_low: 20, paperless_id_high: 30, source: 'import' }),
    ]);
  } finally {
    sqlite.close();
  }
});

it('unmatched false positives suppress real analysis and invalid files never partially write', async () => {
  const { document, documentContent } = await import('../../schema/sqlite/documents.js');
  const { runAnalysis } = await import('../../dedup/analyze.js');
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    const text = Array.from({ length: 100 }, (_, i) => `syntheticword${i}`).join(' ');
    for (const paperlessId of [1, 2]) {
      const { id } = db
        .insert(document)
        .values({ paperlessId, title: 'Synthetic', syncedAt: '2024-01-01' })
        .returning()
        .get();
      db.insert(documentContent)
        .values({ documentId: id, normalizedText: text, wordCount: 100 })
        .run();
    }
    await runAnalysis(db, { force: true });
    expect(sqlite.prepare('SELECT status FROM duplicate_group').all()).toEqual([
      { status: 'pending' },
    ]);
    sqlite.exec("UPDATE duplicate_group SET status='false_positive'");
    const backup = exportDecisions(db);
    expect(backup.groups[0].paperlessIds).toEqual([1, 2]);
    backup.groups[0].paperlessIds.reverse();
    backup.pairDecisions.push([10, 20]);
    sqlite.exec('DELETE FROM duplicate_member; DELETE FROM duplicate_group');
    for (const invalid of [
      { ...backup, version: 2 },
      {
        ...backup,
        pairDecisions: [
          [10, 20],
          [2, 2],
        ],
      },
      { ...backup, groups: [...backup.groups, { ...backup.groups[0], status: 'ignored' }] },
      {
        ...backup,
        groups: [
          { ...backup.groups[0], paperlessIds: Array.from({ length: 201 }, (_, i) => i + 1) },
        ],
      },
    ]) {
      expect(() => importDecisions(db, invalid, { dryRun: false })).toThrow();
      expect(sqlite.prepare('SELECT * FROM duplicate_pair_decision').all()).toEqual([]);
    }
    expect(importDecisions(db, backup, { dryRun: true })).toEqual({
      groupsMatched: 0,
      groupsUnmatched: 1,
      pairDecisionsAdded: 2,
    });
    expect(sqlite.prepare('SELECT * FROM duplicate_pair_decision').all()).toEqual([]);
    expect(importDecisions(db, backup, { dryRun: false })).toEqual({
      groupsMatched: 0,
      groupsUnmatched: 1,
      pairDecisionsAdded: 2,
    });
    expect(
      sqlite
        .prepare(
          'SELECT paperless_id_low,paperless_id_high,source FROM duplicate_pair_decision ORDER BY paperless_id_low',
        )
        .all(),
    ).toEqual([
      { paperless_id_low: 1, paperless_id_high: 2, source: 'import' },
      { paperless_id_low: 10, paperless_id_high: 20, source: 'import' },
    ]);
    const result = await runAnalysis(db, { force: true });
    expect(result.pairsSuppressed).toBe(1);
    expect(sqlite.prepare('SELECT * FROM duplicate_group').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it('matches an empty locally retained group by its exported empty member set', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    sqlite.exec(
      "INSERT INTO duplicate_group (id,confidence_score,algorithm_version,status,created_at,updated_at) VALUES ('empty',1,'test','ignored','2024-01-01','2024-01-01')",
    );
    const backup = exportDecisions(db);
    expect(backup.groups).toEqual([
      { paperlessIds: [], status: 'ignored', decidedAt: '2024-01-01' },
    ]);
    sqlite.exec("UPDATE duplicate_group SET status='pending'");
    expect(importDecisions(db, backup, { dryRun: false })).toEqual({
      groupsMatched: 1,
      groupsUnmatched: 0,
      pairDecisionsAdded: 0,
    });
    expect(sqlite.prepare('SELECT status FROM duplicate_group').all()).toEqual([
      { status: 'ignored' },
    ]);
  } finally {
    sqlite.close();
  }
});
