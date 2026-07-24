import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document, documentContent } from '../../schema/sqlite/documents.js';
import {
  beginCustomFieldDiscoveryRun,
  completeCustomFieldDiscoveryRun,
  createCustomFieldDiscoverySource,
  failCustomFieldDiscoveryRun,
  getLatestCustomFieldDiscoveryRun,
} from '../custom-field-discovery-store.js';
import { scanCustomFieldCandidatesV2 } from '../custom-field-discovery-v2.js';
describe('custom field discovery source', () => {
  it('pages mirrored OCR with opaque keyset cursors and detects source changes', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    for (const paperlessId of [2, 7, 9]) {
      const id = `document-${paperlessId}`;
      db.insert(document)
        .values({
          id,
          paperlessId,
          title: `Document ${paperlessId}`,
          syncedAt: '2026-07-24T00:00:00.000Z',
        })
        .run();
      db.insert(documentContent)
        .values({
          id: `content-${paperlessId}`,
          documentId: id,
          fullText: `Account: ${paperlessId}`,
        })
        .run();
    }
    const source = createCustomFieldDiscoverySource(sqlite, 'a'.repeat(64));
    expect(source.snapshot.documentCount).toBe(3);
    expect(source.snapshot.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const first = await source.readPage({
      pass: 'labels',
      cursor: null,
      limit: 2,
      sourceFingerprint: source.snapshot.fingerprint,
    });
    expect(first.items).toEqual([
      { ocrText: 'Account: 2', domain: null },
      { ocrText: 'Account: 7', domain: null },
    ]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const isolatedSource = createCustomFieldDiscoverySource(sqlite, 'a'.repeat(64));
    await expect(
      isolatedSource.readPage({
        pass: 'labels',
        cursor: first.nextCursor,
        limit: 2,
        sourceFingerprint: source.snapshot.fingerprint,
      }),
    ).rejects.toThrow('Invalid discovery cursor');
    const second = await source.readPage({
      pass: 'labels',
      cursor: first.nextCursor,
      limit: 2,
      sourceFingerprint: source.snapshot.fingerprint,
    });
    expect(second.items).toEqual([{ ocrText: 'Account: 9', domain: null }]);
    expect(second.nextCursor).toBeNull();
    db.update(documentContent)
      .set({ fullText: 'Account: changed' })
      .where(eq(documentContent.id, 'content-9'))
      .run();
    await expect(source.readCurrentFingerprint!()).resolves.not.toBe(source.snapshot.fingerprint);
  });
});

describe('custom field discovery persistence', () => {
  it('persists only the aggregate V2 result and exposes an opaque public run', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const documentId = 'private-document-id';
    db.insert(document)
      .values({
        id: documentId,
        paperlessId: 987654,
        title: 'Private title',
        syncedAt: '2026-07-24T00:00:00.000Z',
      })
      .run();
    db.insert(documentContent)
      .values({
        documentId,
        fullText: 'Payment Status: Paid',
      })
      .run();
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at)
         VALUES ('discovery-job', 'custom_field_discovery', 'running', ?)`,
      )
      .run('2026-07-24T10:00:00.000Z');

    const source = createCustomFieldDiscoverySource(sqlite, 'a1'.repeat(32));
    const publicKey = beginCustomFieldDiscoveryRun(
      sqlite,
      'discovery-job',
      source.snapshot.fingerprint,
      '2026-07-24T10:00:00.000Z',
    );
    const result = await scanCustomFieldCandidatesV2(source, {
      minimumGlobalDocuments: 1,
    });
    completeCustomFieldDiscoveryRun(sqlite, 'discovery-job', result, '2026-07-24T10:01:00.000Z');

    const latest = getLatestCustomFieldDiscoveryRun(db);
    expect(latest).toMatchObject({
      key: publicKey,
      status: 'completed',
      createdAt: '2026-07-24T10:00:00.000Z',
      completedAt: '2026-07-24T10:01:00.000Z',
      result: expect.objectContaining({
        status: 'completed',
        candidates: [expect.objectContaining({ name: 'Payment Status' })],
      }),
    });
    const persisted = sqlite
      .prepare('SELECT result_json AS resultJson FROM custom_field_discovery_run')
      .get() as { resultJson: string };
    expect(persisted.resultJson).not.toContain(documentId);
    expect(persisted.resultJson).not.toContain('987654');
    expect(persisted.resultJson).not.toContain('Private title');
    expect(persisted.resultJson).not.toContain('Payment Status: Paid');
    expect(persisted.resultJson).not.toContain('ocrText');
    expect(JSON.stringify(latest)).not.toContain('jobId');
  });

  it('stores a safe failure state without exposing the private exception', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at)
         VALUES ('failed-job', 'custom_field_discovery', 'running', ?)`,
      )
      .run('2026-07-24T10:00:00.000Z');
    beginCustomFieldDiscoveryRun(sqlite, 'failed-job', 'a'.repeat(64), '2026-07-24T10:00:00.000Z');

    failCustomFieldDiscoveryRun(sqlite, 'failed-job', '2026-07-24T10:01:00.000Z');

    expect(getLatestCustomFieldDiscoveryRun(db)).toMatchObject({
      status: 'failed',
      result: null,
      error: { code: 'DISCOVERY_FAILED', retryable: true },
    });
    expect(JSON.stringify(getLatestCustomFieldDiscoveryRun(db))).not.toContain('private');
  });
});
