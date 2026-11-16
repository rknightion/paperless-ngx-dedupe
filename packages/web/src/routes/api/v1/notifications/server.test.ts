import { expect, it } from 'vitest';
import {
  createDatabaseWithHandle,
  migrateDatabase,
  parseConfig,
  setConfigBatch,
} from '@paperless-dedupe/core';
import { GET } from './+server';

it('returns only notification availability, format and event preferences without destination credentials', async () => {
  const { db, sqlite } = createDatabaseWithHandle(':memory:');
  try {
    await migrateDatabase(sqlite);
    setConfigBatch(db, { 'notifications.minNewGroups': 4, 'notifications.onJobFailure': false });
    for (const configured of [true, false]) {
      const config = parseConfig({
        PAPERLESS_URL: 'https://paperless.example.test',
        PAPERLESS_API_TOKEN: 'synthetic-paperless-token',
        NOTIFY_FORMAT: 'ntfy',
        ...(configured
          ? {
              NOTIFY_URL: 'https://notify.example.test/private-topic',
              NOTIFY_AUTH_HEADER: 'Bearer synthetic-private-notify-token',
            }
          : {}),
      });
      const response = await GET({ locals: { db, config } } as never);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        data: {
          configured,
          format: 'ntfy',
          events: {
            onNewDuplicates: true,
            minNewGroups: 4,
            onJobFailure: false,
            scheduledRunsOnly: true,
          },
        },
      });
      expect(body).not.toContain('private-topic');
      expect(body).not.toContain('synthetic-private-notify-token');
    }
  } finally {
    sqlite.close();
  }
});
