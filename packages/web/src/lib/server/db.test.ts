import { beforeEach, expect, it, vi } from 'vitest';
import { type AppConfig } from '@paperless-dedupe/core';
const mocks = vi.hoisted(() => ({
  db: {},
  sqlite: {},
  createDatabaseWithHandle: vi.fn(),
  migrateDatabase: vi.fn(),
  recoverStaleJobs: vi.fn(),
  pruneExpiredReviewState: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@paperless-dedupe/core', () => ({
  ...mocks,
  createLogger: () => ({ info: mocks.info, warn: mocks.warn }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.createDatabaseWithHandle.mockReturnValue({ db: mocks.db, sqlite: mocks.sqlite });
  mocks.migrateDatabase.mockResolvedValue(undefined);
  mocks.recoverStaleJobs.mockReturnValue(0);
  mocks.pruneExpiredReviewState
    .mockReset()
    .mockReturnValue({ plansDeleted: 1, reservationsDeleted: 2 });
});
it('prunes once after recovery even for concurrent and subsequent database calls', async () => {
  const { getDatabase } = await import('./db');
  const config = { DATABASE_URL: ':memory:' } as AppConfig;
  await Promise.all([getDatabase(config), getDatabase(config)]);
  await getDatabase(config);
  expect(mocks.pruneExpiredReviewState).toHaveBeenCalledExactlyOnceWith(mocks.sqlite);
  expect(mocks.recoverStaleJobs.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.pruneExpiredReviewState.mock.invocationCallOrder[0],
  );
  expect(mocks.info).toHaveBeenCalledWith(
    { plansDeleted: 1, reservationsDeleted: 2 },
    expect.any(String),
  );
});
it('opens and caches the database when pruning throws', async () => {
  mocks.pruneExpiredReviewState.mockImplementation(() => {
    throw new Error('synthetic prune failure');
  });
  const { getDatabase } = await import('./db');
  const config = { DATABASE_URL: ':memory:' } as AppConfig;
  await expect(getDatabase(config)).resolves.toEqual({ db: mocks.db, sqlite: mocks.sqlite });
  await expect(getDatabase(config)).resolves.toEqual({ db: mocks.db, sqlite: mocks.sqlite });
  expect(mocks.warn).toHaveBeenCalledOnce();
  expect(mocks.pruneExpiredReviewState).toHaveBeenCalledOnce();
});
it('does not log when no rows were pruned', async () => {
  mocks.pruneExpiredReviewState.mockReturnValue({ plansDeleted: 0, reservationsDeleted: 0 });
  const { getDatabase } = await import('./db');
  await getDatabase({ DATABASE_URL: ':memory:' } as AppConfig);
  expect(mocks.pruneExpiredReviewState).toHaveBeenCalledOnce();
  expect(mocks.info).not.toHaveBeenCalled();
});
