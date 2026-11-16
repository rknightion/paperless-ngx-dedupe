import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { refreshPendingGroupFileSizes, getDuplicateStats } from '../duplicates.js';

it('refreshes only pending group members and counts unique non-primary storage with unknown sizes preserved', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    expect(getDuplicateStats(db).reclaimableBytes).toBe(0);
    for (const [id, status] of [
      ['pending', 'pending'],
      ['overlap', 'pending'],
      ['ignored', 'ignored'],
    ]) {
      sqlite
        .prepare(
          "INSERT INTO duplicate_group (id, confidence_score, algorithm_version, status, created_at, updated_at) VALUES (?, 1, 'synthetic', ?, '2026-01-01', '2026-01-01')",
        )
        .run(id, status);
    }
    for (let id = 1; id <= 5; id++) {
      sqlite
        .prepare(
          "INSERT INTO document (id, paperless_id, title, synced_at) VALUES (?, ?, 'Synthetic file', '2026-01-01')",
        )
        .run(`file-${id}`, id);
    }
    for (const [group, id, primary] of [
      ['pending', 1, 1],
      ['pending', 2, 0],
      ['pending', 3, 0],
      ['overlap', 1, 1],
      ['overlap', 2, 0],
      ['ignored', 4, 0],
    ] as const) {
      sqlite
        .prepare(
          'INSERT INTO duplicate_member (id, group_id, document_id, is_primary) VALUES (?, ?, ?, ?)',
        )
        .run(`${group}-${id}`, group, `file-${id}`, primary);
    }
    expect(getDuplicateStats(db).reclaimableBytes).toBeNull();
    const fetched: number[] = [];
    const client = {
      getDocumentMetadata: async (id: number, kind: 'files') => {
        expect(kind).toBe('files');
        fetched.push(id);
        return {
          originalChecksum: null,
          originalSize: id * 100,
          archiveSize: id === 3 ? null : 20,
          hasArchive: id !== 3,
          originalMimeType: null,
        };
      },
    };
    await refreshPendingGroupFileSizes(db, client);
    expect(fetched.sort()).toEqual([1, 2, 3]);
    expect(
      sqlite
        .prepare(
          'SELECT paperless_id, original_size, archive_size FROM document ORDER BY paperless_id',
        )
        .all(),
    ).toEqual([
      { paperless_id: 1, original_size: 100, archive_size: 20 },
      { paperless_id: 2, original_size: 200, archive_size: 20 },
      { paperless_id: 3, original_size: 300, archive_size: 0 },
      { paperless_id: 4, original_size: null, archive_size: null },
      { paperless_id: 5, original_size: null, archive_size: null },
    ]);
    expect(getDuplicateStats(db).reclaimableBytes).toBe(520);
    await refreshPendingGroupFileSizes(db, {
      getDocumentMetadata: async (id, kind) => {
        if (id === 2) throw new Error('Synthetic metadata failure');
        return client.getDocumentMetadata(id, kind);
      },
    });
    expect(getDuplicateStats(db).reclaimableBytes).toBeNull();
    expect(
      sqlite.prepare("SELECT original_size, archive_size FROM document WHERE id = 'file-2'").get(),
    ).toEqual({ original_size: null, archive_size: null });
  } finally {
    sqlite.close();
  }
});
