import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup, duplicateMember } from '../../schema/sqlite/duplicates.js';
import { setPrimaryDocument } from '../duplicates.js';

it('marks an explicit keeper selection manual atomically with the selected member', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    for (const id of [1, 2])
      db.insert(document)
        .values({
          id: `doc-${id}`,
          paperlessId: id,
          title: 'Synthetic keeper',
          syncedAt: '2024-01-01',
        })
        .run();
    db.insert(duplicateGroup)
      .values({
        id: 'group',
        confidenceScore: 1,
        algorithmVersion: 'test',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      })
      .run();
    for (const id of [1, 2])
      db.insert(duplicateMember)
        .values({
          id: `member-${id}`,
          groupId: 'group',
          documentId: `doc-${id}`,
          isPrimary: id === 1,
        })
        .run();
    expect(
      sqlite.prepare("SELECT primary_source FROM duplicate_group WHERE id='group'").get(),
    ).toEqual({ primary_source: 'auto' });
    expect(setPrimaryDocument(db, 'group', 'missing')).toBe(false);
    expect(
      sqlite.prepare("SELECT primary_source FROM duplicate_group WHERE id='group'").get(),
    ).toEqual({ primary_source: 'auto' });
    expect(setPrimaryDocument(db, 'group', 'doc-2')).toBe(true);
    expect(
      sqlite
        .prepare("SELECT primary_source,updated_at FROM duplicate_group WHERE id='group'")
        .get(),
    ).toEqual({ primary_source: 'manual', updated_at: expect.not.stringMatching(/^2024-01-01$/) });
    expect(
      sqlite.prepare('SELECT document_id FROM duplicate_member WHERE is_primary=1').all(),
    ).toEqual([{ document_id: 'doc-2' }]);
    sqlite.exec(
      "CREATE TRIGGER fail_primary_source BEFORE UPDATE OF primary_source ON duplicate_group BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END",
    );
    expect(() => setPrimaryDocument(db, 'group', 'doc-1')).toThrow('synthetic rollback');
    expect(
      sqlite.prepare('SELECT document_id FROM duplicate_member WHERE is_primary=1').all(),
    ).toEqual([{ document_id: 'doc-2' }]);
  } finally {
    sqlite.close();
  }
});
