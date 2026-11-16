import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { getDuplicateGroupFiles } from '../duplicates.js';

it('reads bounded group file facts without writing and counts only non-primary bytes', async () => {
  const handle = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(handle.sqlite);
    handle.sqlite
      .prepare(
        "INSERT INTO duplicate_group (id, confidence_score, algorithm_version, status, created_at, updated_at) VALUES ('files', 1, 'synthetic', 'pending', '2026-01-01', '2026-01-01')",
      )
      .run();
    for (let id = 1; id <= 9; id++) {
      handle.sqlite
        .prepare(
          "INSERT INTO document (id, paperless_id, title, synced_at) VALUES (?, ?, 'Synthetic file', '2026-01-01')",
        )
        .run(`file-${id}`, id);
      handle.sqlite
        .prepare(
          "INSERT INTO duplicate_member (id, group_id, document_id, is_primary) VALUES (?, 'files', ?, ?)",
        )
        .run(`member-${id}`, `file-${id}`, id === 3 ? 1 : 0);
    }
    const before = handle.sqlite.prepare('SELECT total_changes() AS count').get();
    let active = 0;
    let maximum = 0;
    const ids: number[] = [];
    const client = {
      getDocumentMetadata: async (id: number, kind: 'files') => {
        expect(kind).toBe('files');
        ids.push(id);
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return {
          originalChecksum: 'synthetic-checksum',
          originalSize: id * 100,
          archiveSize: id % 2 ? 10 : null,
          hasArchive: Boolean(id % 2),
          originalMimeType: 'application/pdf',
        };
      },
    };
    const result = await getDuplicateGroupFiles(handle.db, 'files', client);
    expect(result).toMatchObject({ identicalOriginals: true, reclaimableBytes: 4240 });
    expect(result?.members.find((member) => member.paperlessId === 3)).toEqual({
      documentId: 'file-3',
      paperlessId: 3,
      originalChecksum: 'synthetic-checksum',
      originalSize: 300,
      archiveSize: 10,
      hasArchive: true,
      originalMimeType: 'application/pdf',
    });
    expect(ids.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(handle.sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(before);
    expect(await getDuplicateGroupFiles(handle.db, 'missing', client)).toBeNull();
    expect(ids).toHaveLength(9);
    for (const missing of ['original', 'archive'] as const) {
      const unknown = await getDuplicateGroupFiles(handle.db, 'files', {
        getDocumentMetadata: async (id, kind) => ({
          ...(await client.getDocumentMetadata(id, kind)),
          ...(id === 1
            ? {
                originalChecksum: null,
                ...(missing === 'original' ? { originalSize: null } : { archiveSize: null }),
              }
            : {}),
        }),
      });
      expect(unknown).toMatchObject({ identicalOriginals: false, reclaimableBytes: null });
    }
    expect(handle.sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(before);
  } finally {
    handle.sqlite.close();
  }
});
