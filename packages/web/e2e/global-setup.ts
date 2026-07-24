import { startMockPaperless } from './fixtures/mock-paperless';
import { clearDatabase } from './fixtures/seed-data';
import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname, '../data/e2e-test.db');

export default async function globalSetup() {
  // Start mock Paperless before the cold-start scheduler can evaluate any
  // leftover test schedules from an interrupted previous run.
  await startMockPaperless();

  // Playwright starts webServer before global setup. The adapter initializes and
  // migrates this database at module load, so unlinking it here would leave the
  // live process attached to an orphaned inode while tests open a new empty file.
  await waitForMigratedDatabase();
  clearDatabase(DB_PATH);

  console.log('Mock Paperless server started on port 18923');
}

async function waitForMigratedDatabase(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const sqlite = new Database(DB_PATH, { readonly: true });
      const migrated = sqlite
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'table' AND name = 'dispatch_intent'`,
        )
        .get();
      sqlite.close();
      if (migrated) return;
    } catch {
      // Adapter startup may still be creating the database.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('E2E database migration did not complete before global setup');
}
