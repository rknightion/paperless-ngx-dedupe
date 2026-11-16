import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import {
  previewPrimarySelection,
  applyPrimarySelection,
  PrimarySelectionConflictError,
} from '../duplicates.js';

it('previews without writes and applies only eligible pending keepers with count protection', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (let i = 1; i <= 2; i++)
      sqlite
        .prepare(
          'INSERT INTO document (id,paperless_id,title,added_date,synced_at) VALUES (?,?,?,?,?)',
        )
        .run(`doc-${i}`, i, `Synthetic ${i}`, `2024-0${i}-01`, '2024-03-01');
    for (const [id, status, source, confidence] of [
      ['auto', 'pending', 'auto', 1],
      ['manual', 'pending', 'manual', 1],
      ['resolved', 'ignored', 'auto', 1],
      ['low', 'pending', 'auto', 0.3],
    ] as const) {
      sqlite
        .prepare(
          'INSERT INTO duplicate_group (id,confidence_score,algorithm_version,status,primary_source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        )
        .run(id, confidence, 'test', status, source, '2024-01-01', '2099-01-01T00:00:00.000Z');
      for (let i = 1; i <= 2; i++)
        sqlite
          .prepare(
            'INSERT INTO duplicate_member (id,group_id,document_id,is_primary) VALUES (?,?,?,?)',
          )
          .run(`${id}-${i}`, id, `doc-${i}`, i === 1 ? 1 : 0);
    }
    const snapshot = () => ({
      groups: sqlite.prepare('SELECT * FROM duplicate_group ORDER BY id').all(),
      members: sqlite.prepare('SELECT * FROM duplicate_member ORDER BY id').all(),
    });
    const before = snapshot();
    const options = { strategy: 'newest_added' as const, minConfidence: 0.9 };
    expect(previewPrimarySelection(db, options)).toEqual({
      groupsEvaluated: 1,
      groupsChanging: 1,
      sample: [
        {
          groupId: 'auto',
          current: { paperlessId: 1, title: 'Synthetic 1' },
          proposed: { paperlessId: 2, title: 'Synthetic 2' },
          reason: 'Newest added date',
        },
      ],
    });
    expect(snapshot()).toEqual(before);
    expect(() => applyPrimarySelection(db, { ...options, expectedChanging: 2 })).toThrow(
      PrimarySelectionConflictError,
    );
    expect(snapshot()).toEqual(before);
    expect(applyPrimarySelection(db, { ...options, expectedChanging: 1 })).toEqual({ updated: 1 });
    const primaries = () =>
      sqlite
        .prepare(
          'SELECT group_id,document_id FROM duplicate_member WHERE is_primary=1 ORDER BY group_id',
        )
        .all();
    expect(primaries()).toEqual([
      { group_id: 'auto', document_id: 'doc-2' },
      { group_id: 'low', document_id: 'doc-1' },
      { group_id: 'manual', document_id: 'doc-1' },
      { group_id: 'resolved', document_id: 'doc-1' },
    ]);
    expect(
      (
        sqlite.prepare("SELECT updated_at FROM duplicate_group WHERE id='auto'").get() as {
          updated_at: string;
        }
      ).updated_at,
    ).toBe('2099-01-01T00:00:00.001Z');
    expect(
      applyPrimarySelection(db, { ...options, includeManual: true, expectedChanging: 1 }),
    ).toEqual({ updated: 1 });
    expect(primaries()).toContainEqual({ group_id: 'manual', document_id: 'doc-2' });
    expect(
      sqlite.prepare("SELECT primary_source FROM duplicate_group WHERE id='manual'").get(),
    ).toEqual({ primary_source: 'manual' });
    expect(applyPrimarySelection(db, { ...options, expectedChanging: 0 })).toEqual({ updated: 0 });
  } finally {
    sqlite.close();
  }
});

it('caps preview samples and rolls back all keepers when any group update fails', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (let id = 1; id <= 2; id++)
      sqlite
        .prepare('INSERT INTO document (id,paperless_id,title,synced_at) VALUES (?,?,?,?)')
        .run(`doc-${id}`, id, 'Synthetic', '2024-01-01');
    for (let i = 0; i < 51; i++) {
      const groupId = String(i).padStart(2, '0');
      sqlite
        .prepare(
          "INSERT INTO duplicate_group (id,confidence_score,algorithm_version,created_at,updated_at) VALUES (?,1,'test','2024-01-01','2024-01-01')",
        )
        .run(groupId);
      for (let id = 1; id <= 2; id++)
        sqlite
          .prepare(
            'INSERT INTO duplicate_member (id,group_id,document_id,is_primary) VALUES (?,?,?,?)',
          )
          .run(`${groupId}-${id}`, groupId, `doc-${id}`, id === 2 ? 1 : 0);
    }
    const options = { strategy: 'lowest_id' as const };
    const preview = previewPrimarySelection(db, options);
    expect(preview.groupsEvaluated).toBe(51);
    expect(preview.groupsChanging).toBe(51);
    expect(preview.sample).toHaveLength(50);
    expect(preview.sample.at(-1)?.groupId).toBe('49');
    const before = sqlite.prepare('SELECT * FROM duplicate_member ORDER BY id').all();
    sqlite.exec(
      "CREATE TRIGGER fail_keeper BEFORE UPDATE ON duplicate_group WHEN NEW.id='50' BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END",
    );
    expect(() => applyPrimarySelection(db, { ...options, expectedChanging: 51 })).toThrow(
      'synthetic rollback',
    );
    expect(sqlite.prepare('SELECT * FROM duplicate_member ORDER BY id').all()).toEqual(before);
    expect(sqlite.prepare('SELECT DISTINCT updated_at FROM duplicate_group').all()).toEqual([
      { updated_at: '2024-01-01' },
    ]);
  } finally {
    sqlite.close();
  }
});
