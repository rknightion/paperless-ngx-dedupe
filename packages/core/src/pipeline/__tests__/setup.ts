import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabaseWithHandle, type AppDatabase, type Database } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';

// Reuse the same env vars as the integration tests — same Paperless instance
const PAPERLESS_URL = process.env.INTEGRATION_PAPERLESS_URL ?? 'http://localhost:8000';
const ADMIN_USER = process.env.INTEGRATION_ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.INTEGRATION_ADMIN_PASSWORD ?? 'admin';

export { PAPERLESS_URL };

/**
 * Obtain an API token from Paperless-NGX.
 */
export async function getApiToken(): Promise<string> {
  const response = await fetch(`${PAPERLESS_URL}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get API token: ${response.status} ${response.statusText} - ${body}`);
  }

  const json = (await response.json()) as { token: string };
  return json.token;
}

/**
 * Upload a single PDF to Paperless-NGX.
 * Returns the task ID assigned by Paperless.
 */
export async function uploadPdf(
  token: string,
  filename: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const blob = new Blob([Buffer.from(pdfBytes)], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('document', blob, filename);
  formData.append('title', filename.replace('.pdf', ''));

  const response = await fetch(`${PAPERLESS_URL}/api/documents/post_document/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to upload "${filename}": ${response.status} ${response.statusText} - ${body}`,
    );
  }

  const taskId = await response.text();
  return taskId.replace(/"/g, '');
}

/**
 * Upload documents with a concurrency pool.
 * Logs progress every 20 documents.
 */
export async function uploadAllDocuments(
  token: string,
  documents: Array<{ filename: string; pdfBytes: Uint8Array }>,
  concurrency: number = 5,
): Promise<void> {
  let completed = 0;
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < documents.length) {
      const doc = documents[idx++];
      await uploadPdf(token, doc.filename, doc.pdfBytes);
      completed++;
      if (completed % 20 === 0 || completed === documents.length) {
        console.log(`  Uploaded ${completed}/${documents.length} documents`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, documents.length) }, () => worker());
  await Promise.all(workers);
}

/**
 * Poll Paperless-NGX statistics until it reports at least `expectedCount` documents.
 */
export async function waitForAllProcessed(
  token: string,
  expectedCount: number,
  timeoutMs: number = 600_000,
): Promise<void> {
  const start = Date.now();
  const pollInterval = 5_000;
  let lastCount = 0;

  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${PAPERLESS_URL}/api/statistics/`, {
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/json; version=9',
      },
    });

    if (response.ok) {
      const stats = (await response.json()) as { documents_total: number };
      if (stats.documents_total >= expectedCount) {
        console.log(`  All ${expectedCount} documents processed`);
        return;
      }
      if (stats.documents_total !== lastCount) {
        lastCount = stats.documents_total;
        console.log(`  Processed ${lastCount}/${expectedCount} documents...`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timed out waiting for ${expectedCount} documents after ${timeoutMs}ms`);
}

/**
 * Create a temporary SQLite database with fully migrated schema.
 */
export async function createTestDatabase(): Promise<{
  db: AppDatabase;
  sqlite: InstanceType<typeof Database>;
  tmpDir: string;
  cleanup: () => void;
}> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dedupe-pipeline-'));
  const dbPath = join(tmpDir, 'pipeline-test.db');
  const { db, sqlite } = createDatabaseWithHandle(dbPath);
  await migrateDatabase(sqlite);
  return {
    db,
    sqlite,
    tmpDir,
    cleanup: () => {
      sqlite.close();
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
