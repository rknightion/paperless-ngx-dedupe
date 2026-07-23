import {
  createDatabaseWithHandle,
  migrateDatabase,
  recoverStaleJobs,
  createLogger,
} from '@paperless-dedupe/core';
import type { AppDatabase } from '@paperless-dedupe/core';
import type { AppConfig } from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';

let cachedDb: AppDatabase | undefined;
let cachedSqlite: Database.Database | undefined;

export async function getDatabase(
  config: AppConfig,
): Promise<{ db: AppDatabase; sqlite: Database.Database }> {
  if (cachedDb && cachedSqlite) return { db: cachedDb, sqlite: cachedSqlite };

  const { db, sqlite } = createDatabaseWithHandle(config.DATABASE_URL);
  await migrateDatabase(sqlite);

  const recovered = recoverStaleJobs(db);
  if (recovered > 0) {
    const logger = createLogger('startup');
    logger.info({ recovered }, `Recovered ${recovered} stale job(s) from previous run`);
  }

  cachedDb = db;
  cachedSqlite = sqlite;
  return { db, sqlite };
}
