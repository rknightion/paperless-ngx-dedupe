import {
  createDatabaseWithHandle,
  migrateDatabase,
  recoverStaleJobs,
  createLogger,
} from '@paperless-dedupe/core';
import type { AppDatabase } from '@paperless-dedupe/core';
import type { AppConfig } from '@paperless-dedupe/core';
import type Database from 'better-sqlite3';
import { loadSqliteVec, initRagTables } from '@paperless-dedupe/core/rag/vector-store.js';
import { getRagConfig } from '@paperless-dedupe/core/rag/config.js';

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

  // Initialize RAG tables when enabled
  if (config.RAG_ENABLED) {
    try {
      loadSqliteVec(sqlite);
      const ragConfig = getRagConfig(db);
      initRagTables(sqlite, ragConfig.embeddingDimensions);
    } catch (e) {
      const logger = createLogger('startup');
      logger.error({ err: e }, 'Failed to initialize RAG tables');
    }
  }

  cachedDb = db;
  cachedSqlite = sqlite;
  return { db, sqlite };
}
