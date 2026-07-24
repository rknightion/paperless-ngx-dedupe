import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

import {
  cleanupE2eDatabase,
  E2E_DATABASE_PATHS,
  withE2ePrestart,
} from '../../../../e2e/prestart-cleanup.js';
import playwrightConfig from '../../../../playwright.config.js';

describe('E2E prestart cleanup', () => {
  it('targets only the fixed E2E database and its SQLite sidecars', () => {
    expect(E2E_DATABASE_PATHS).toEqual([
      resolve('packages/web/data/e2e-test.db'),
      resolve('packages/web/data/e2e-test.db-wal'),
      resolve('packages/web/data/e2e-test.db-shm'),
    ]);

    const remove = vi.fn();
    cleanupE2eDatabase(remove);

    expect(remove.mock.calls.map(([path]) => path)).toEqual(E2E_DATABASE_PATHS);
  });

  it('places cleanup before adapter build and startup', () => {
    expect(withE2ePrestart('pnpm build && pnpm preview --port 4173')).toBe(
      'node e2e/prestart-cleanup.ts && pnpm build && pnpm preview --port 4173',
    );
  });

  it('always owns the exact adapter server whose database it cleans', () => {
    expect(playwrightConfig.webServer).toMatchObject({
      port: 4173,
      reuseExistingServer: false,
    });
  });
});
