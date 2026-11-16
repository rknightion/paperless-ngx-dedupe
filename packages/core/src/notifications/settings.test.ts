import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';
import { setConfigBatch } from '../queries/config.js';
import { getNotificationSettings } from './settings.js';

it('reads approved notification defaults and persists validated event preferences', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    expect(getNotificationSettings(db)).toEqual({
      onNewDuplicates: true,
      minNewGroups: 1,
      onJobFailure: true,
      scheduledRunsOnly: true,
    });
    setConfigBatch(db, {
      'notifications.onNewDuplicates': false,
      'notifications.minNewGroups': 10000,
      'notifications.onJobFailure': false,
      'notifications.scheduledRunsOnly': false,
    });
    expect(getNotificationSettings(db)).toEqual({
      onNewDuplicates: false,
      minNewGroups: 10000,
      onJobFailure: false,
      scheduledRunsOnly: false,
    });
    for (const value of [0, 10001, 1.5])
      expect(() => setConfigBatch(db, { 'notifications.minNewGroups': value })).toThrow();
    expect(getNotificationSettings(db).minNewGroups).toBe(10000);
  } finally {
    sqlite.close();
  }
});
