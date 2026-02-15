import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createDatabaseWithHandle } from '../../../db/client.js';
import { migrateDatabase } from '../../../db/migrate.js';
import { syncDocuments } from '../../../sync/sync-documents.js';
import { seedDocuments, createIntegrationClient } from './setup.js';
import type { PaperlessClient } from '../../client.js';

describe.skipIf(!process.env.INTEGRATION_TEST)('Sync pipeline against real Paperless-NGX', () => {
  let client: PaperlessClient;
  let tmpDir: string;

  beforeAll(async () => {
    await seedDocuments(5);
    client = await createIntegrationClient();
  }, 180_000);

  afterAll(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('syncs documents from real Paperless-NGX into local SQLite', async () => {
    // Create a temporary SQLite database
    tmpDir = mkdtempSync(join(tmpdir(), 'dedupe-integration-'));
    const dbPath = join(tmpDir, 'test.db');
    const { db, sqlite } = createDatabaseWithHandle(dbPath);

    // Run migrations to set up schema
    await migrateDatabase(sqlite);

    // Execute the full sync pipeline
    const result = await syncDocuments({ db, client }, { forceFullSync: true });

    // Verify sync results
    expect(result.syncType).toBe('full');
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.totalFetched).toBeGreaterThanOrEqual(5);
    expect(result.durationMs).toBeGreaterThan(0);

    // Close the database
    sqlite.close();
  }, 120_000);

  it('incremental sync skips unchanged documents', async () => {
    // Create a fresh database and run full sync first
    const incrementalDir = mkdtempSync(join(tmpdir(), 'dedupe-integration-inc-'));
    const dbPath = join(incrementalDir, 'test.db');
    const { db, sqlite } = createDatabaseWithHandle(dbPath);
    await migrateDatabase(sqlite);

    // First sync: full
    const fullResult = await syncDocuments({ db, client }, { forceFullSync: true });
    expect(fullResult.inserted).toBeGreaterThan(0);

    // Second sync: incremental (should skip all existing documents)
    const incrementalResult = await syncDocuments({ db, client });
    expect(incrementalResult.syncType).toBe('incremental');
    expect(incrementalResult.inserted).toBe(0);
    expect(incrementalResult.skipped).toBeGreaterThan(0);
    expect(incrementalResult.failed).toBe(0);

    sqlite.close();
    rmSync(incrementalDir, { recursive: true, force: true });
  }, 120_000);
});
