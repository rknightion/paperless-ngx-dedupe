import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { exportDecisions } from '../decisions.js';

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
