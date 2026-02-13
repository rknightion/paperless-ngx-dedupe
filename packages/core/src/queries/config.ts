import type { AppDatabase } from '../db/client.js';
import { appConfig } from '../schema/sqlite/app.js';

export function getConfig(db: AppDatabase): Record<string, string> {
  const rows = db.select().from(appConfig).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function setConfig(db: AppDatabase, key: string, value: string): void {
  const now = new Date().toISOString();
  db.insert(appConfig)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export function setConfigBatch(db: AppDatabase, settings: Record<string, string>): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(settings)) {
      tx.insert(appConfig)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}
