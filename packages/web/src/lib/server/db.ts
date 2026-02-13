import { createDatabaseWithHandle, migrateDatabase } from '@paperless-dedupe/core';
import type { AppDatabase } from '@paperless-dedupe/core';
import type { AppConfig } from '@paperless-dedupe/core';

let cachedDb: AppDatabase | undefined;

export async function getDatabase(config: AppConfig): Promise<AppDatabase> {
  if (cachedDb) return cachedDb;

  const { db, sqlite } = createDatabaseWithHandle(config.DATABASE_URL);
  await migrateDatabase(sqlite);
  cachedDb = db;
  return db;
}
