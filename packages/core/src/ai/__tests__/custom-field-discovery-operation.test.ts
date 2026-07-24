import { describe, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import { getLatestCustomFieldDiscoveryRun } from '../custom-field-discovery-store.js';
import { runCustomFieldDiscoveryOperation } from '../custom-field-discovery-operation.js';

describe('runCustomFieldDiscoveryOperation', () => {
  it('runs the bounded scanner and durably publishes only an aggregate summary', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    for (let index = 0; index < 5; index++) {
      const id = `private-${index}`;
      db.insert(document)
        .values({
          id,
          paperlessId: index + 1,
          title: `Private ${index}`,
          syncedAt: '2026-07-24T00:00:00.000Z',
        })
        .run();
      db.insert(documentContent)
        .values({
          documentId: id,
          fullText: `Payment Status: ${index % 2 ? 'Open' : 'Paid'}\nExisting Field: secret-${index}`,
        })
        .run();
    }
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at)
         VALUES ('job-discovery', 'custom_field_discovery', 'running', ?)`,
      )
      .run('2026-07-24T10:00:00.000Z');
    const progress = vi.fn(async () => undefined);

    const summary = await runCustomFieldDiscoveryOperation({
      sqlite,
      db,
      jobId: 'job-discovery',
      taskData: { existingFieldNames: ['Existing Field'] },
      onProgress: progress,
      now: () => new Date('2026-07-24T10:00:00.000Z'),
      opaqueToken: '12'.repeat(32),
    });

    expect(summary).toMatchObject({
      discoveryKey: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
      candidates: 1,
      documentsScanned: 5,
    });
    expect(progress).toHaveBeenCalledWith(0, 'Scanning local OCR for recurring fields');
    expect(progress).toHaveBeenLastCalledWith(1, 'Custom-field recommendations ready');
    const latest = getLatestCustomFieldDiscoveryRun(db);
    expect(latest?.result?.candidates.map(({ name }) => name)).toEqual(['Payment Status']);
    expect(JSON.stringify(summary)).not.toContain('private-');
    expect(JSON.stringify(latest)).not.toContain('secret-');
  });

  it('rejects malformed task data before creating a run', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at)
         VALUES ('job-invalid', 'custom_field_discovery', 'running', ?)`,
      )
      .run('2026-07-24T10:00:00.000Z');

    await expect(
      runCustomFieldDiscoveryOperation({
        sqlite,
        db,
        jobId: 'job-invalid',
        taskData: { existingFieldNames: ['ok'], unexpected: true },
        onProgress: async () => undefined,
      }),
    ).rejects.toThrow(/task data/i);

    expect(getLatestCustomFieldDiscoveryRun(db)).toBeNull();
  });
});
