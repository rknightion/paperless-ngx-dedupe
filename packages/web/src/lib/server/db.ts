import {
  createDatabaseWithHandle,
  migrateDatabase,
  recoverStaleJobs,
  pruneExpiredReviewState,
  createLogger,
} from '@paperless-dedupe/core';
import type { AppDatabase } from '@paperless-dedupe/core';
import type { AppConfig } from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';

let cachedDb: AppDatabase | undefined;
let cachedSqlite: Database.Database | undefined;
let pendingDatabase: Promise<{ db: AppDatabase; sqlite: Database.Database }> | undefined;

export async function getDatabase(
  config: AppConfig,
): Promise<{ db: AppDatabase; sqlite: Database.Database }> {
  if (cachedDb && cachedSqlite) return { db: cachedDb, sqlite: cachedSqlite };
  if (pendingDatabase) return pendingDatabase;

  pendingDatabase = (async () => {
    const { db, sqlite } = createDatabaseWithHandle(config.DATABASE_URL);
    await migrateDatabase(sqlite);

    const recovered = recoverStaleJobs(db);
    if (recovered > 0) {
      const logger = createLogger('startup');
      logger.info({ recovered }, `Recovered ${recovered} stale job(s) from previous run`);
    }

    const logger = createLogger('startup');
    try {
      const pruned = pruneExpiredReviewState(sqlite);
      if (pruned.plansDeleted > 0 || pruned.reservationsDeleted > 0) {
        logger.info(pruned, 'Pruned expired review state');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to prune expired review state');
    }

    cachedDb = db;
    cachedSqlite = sqlite;
    return { db, sqlite };
  })();

  try {
    return await pendingDatabase;
  } finally {
    pendingDatabase = undefined;
  }
}
