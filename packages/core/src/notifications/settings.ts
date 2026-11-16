import { z } from 'zod';
import { type AppDatabase } from '../db/client.js';
import { appConfig } from '../schema/sqlite/app.js';

const settingsSchema = z.object({
  onNewDuplicates: z.boolean().default(true),
  minNewGroups: z.number().int().min(1).max(10000).default(1),
  onJobFailure: z.boolean().default(true),
  scheduledRunsOnly: z.boolean().default(true),
});

export const DEFAULT_NOTIFICATION_SETTINGS = settingsSchema.parse({});

/** Read event preferences without including the environment-owned destination. */
export function getNotificationSettings(db: AppDatabase) {
  const stored: Record<string, unknown> = {};
  for (const { key, value } of db.select().from(appConfig).all()) {
    if (!key.startsWith('notifications.')) continue;
    try {
      stored[key.slice('notifications.'.length)] = JSON.parse(value);
    } catch {
      // Invalid legacy values use the same defaults as an unset preference.
    }
  }
  const parsed = settingsSchema.safeParse(stored);
  return parsed.success ? parsed.data : { ...DEFAULT_NOTIFICATION_SETTINGS };
}
