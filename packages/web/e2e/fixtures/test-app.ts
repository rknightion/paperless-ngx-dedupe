import { test as base } from '@playwright/test';
import { seedDatabase, clearDatabase } from './seed-data';
import type { SeedResult } from './seed-data';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname, '../../data/e2e-test.db');

let migrationTriggered = false;

type TestFixtures = {
  seedDB: () => SeedResult;
  clearDB: () => void;
  triggerMigration: void;
};

export const test = base.extend<TestFixtures>({
  // Auto-fixture: ensure migration has run before any test by making an API request
  triggerMigration: [
    async ({ request }, use) => {
      if (!migrationTriggered) {
        // Make a request to trigger the app's database migration
        await request.get('/api/v1/health');
        migrationTriggered = true;
      }
      await use();
    },
    { auto: true },
  ],
  seedDB: async ({ triggerMigration: _ }, use) => {
    await use(() => {
      return seedDatabase(DB_PATH);
    });
  },
  clearDB: async ({ triggerMigration: _ }, use) => {
    await use(() => {
      clearDatabase(DB_PATH);
    });
  },
});

export { expect } from '@playwright/test';
export { DB_PATH };
