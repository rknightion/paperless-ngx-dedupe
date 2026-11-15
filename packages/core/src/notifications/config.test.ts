import { describe, expect, it } from 'vitest';
import { parseConfig } from '../config.js';
import { coerceConfigBatch, getConfigMetadata } from '../config/registry.js';

const environment = {
  PAPERLESS_URL: 'https://paperless.example.test',
  PAPERLESS_API_TOKEN: 'synthetic-paperless-token',
};

describe('notification configuration', () => {
  it('defaults to disabled JSON delivery and keeps destination credentials environment-owned', () => {
    expect(parseConfig(environment)).toMatchObject({ NOTIFY_FORMAT: 'json' });
    expect(parseConfig(environment)).not.toHaveProperty('NOTIFY_URL');
    for (const format of ['json', 'ntfy', 'apprise']) {
      expect(
        parseConfig({
          ...environment,
          NOTIFY_URL: 'https://notify.example.test/topic',
          NOTIFY_FORMAT: format,
          NOTIFY_AUTH_HEADER: 'Bearer synthetic-notification-token',
          ORIGIN: 'https://app.example.test',
        }),
      ).toMatchObject({
        NOTIFY_URL: 'https://notify.example.test/topic',
        NOTIFY_FORMAT: format,
        NOTIFY_AUTH_HEADER: 'Bearer synthetic-notification-token',
        ORIGIN: 'https://app.example.test',
      });
    }
    for (const key of ['NOTIFY_URL', 'NOTIFY_AUTH_HEADER']) {
      expect(getConfigMetadata().find((entry) => entry.key === key)).toMatchObject({
        source: 'environment',
        sensitive: true,
        readOnly: true,
      });
      expect(() => coerceConfigBatch({ [key]: 'synthetic-value' })).toThrow(/read-only/);
    }
    expect(getConfigMetadata().find((entry) => entry.key === 'NOTIFY_FORMAT')).toMatchObject({
      source: 'environment',
      default: 'json',
      readOnly: true,
    });
    expect(parseConfig({ ...environment, NOTIFY_URL: '' }).NOTIFY_URL).toBeUndefined();
    expect(() => parseConfig({ ...environment, NOTIFY_FORMAT: 'unsupported' })).toThrow(
      /NOTIFY_FORMAT/,
    );
    expect(() => parseConfig({ ...environment, NOTIFY_URL: 'not-a-url' })).toThrow(/NOTIFY_URL/);
  });
});
