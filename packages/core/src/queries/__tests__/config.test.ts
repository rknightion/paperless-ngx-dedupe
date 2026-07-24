import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import {
  getConfig,
  isSensitiveConfigKey,
  redactSensitiveConfig,
  setConfig,
  setConfigBatch,
} from '../config.js';

// Migration seeds schema_ddl_hash and schema_ddl_snapshot into app_config.
// These tests account for those pre-existing rows.

describe('getConfig', () => {
  let db: AppDatabase;
  let baseKeyCount: number;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    baseKeyCount = Object.keys(getConfig(db)).length;
  });

  it('returns only migration keys for fresh database', () => {
    const config = getConfig(db);
    // Migration may insert schema keys; just verify it is an object
    expect(typeof config).toBe('object');
    expect(Object.keys(config).length).toBe(baseKeyCount);
  });

  it('returns all mutable config rows as key-value pairs', () => {
    setConfig(db, 'sync.batchSize', '100');
    setConfig(db, 'theme', 'dark');

    const config = getConfig(db);
    expect(config['sync.batchSize']).toBe('100');
    expect(config.theme).toBe('dark');
    expect(Object.keys(config).length).toBe(baseKeyCount + 2);
  });
});

describe('setConfig', () => {
  let db: AppDatabase;
  let baseKeyCount: number;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    baseKeyCount = Object.keys(getConfig(db)).length;
  });

  it('inserts a new key', () => {
    setConfig(db, 'theme', 'dark');

    const config = getConfig(db);
    expect(config.theme).toBe('dark');
  });

  it('updates an existing key (upsert)', () => {
    setConfig(db, 'theme', 'dark');
    setConfig(db, 'theme', 'light');

    const config = getConfig(db);
    expect(config.theme).toBe('light');
  });

  it('does not create duplicate keys on upsert', () => {
    setConfig(db, 'key1', 'value1');
    setConfig(db, 'key1', 'value2');

    const config = getConfig(db);
    expect(Object.keys(config).length).toBe(baseKeyCount + 1);
    expect(config.key1).toBe('value2');
  });
});

describe('setConfigBatch', () => {
  let db: AppDatabase;
  let baseKeyCount: number;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    baseKeyCount = Object.keys(getConfig(db)).length;
  });

  it('inserts multiple keys atomically', () => {
    setConfigBatch(db, {
      theme: 'dark',
      language: 'en',
      'sync.batchSize': '100',
    });

    const config = getConfig(db);
    expect(config.theme).toBe('dark');
    expect(Object.keys(config).length).toBe(baseKeyCount + 3);
  });

  it('handles mixed insert and update', () => {
    setConfig(db, 'theme', 'dark');
    setConfig(db, 'lang', 'en');

    setConfigBatch(db, {
      theme: 'light', // update existing
      new_key: 'new_val', // insert new
    });

    const config = getConfig(db);
    expect(config.theme).toBe('light');
    expect(config.new_key).toBe('new_val');
    expect(config.lang).toBe('en'); // unchanged
  });

  it('all values are correct after batch', () => {
    setConfigBatch(db, { a: '1', b: '2', c: '3' });
    setConfigBatch(db, { b: '20', d: '4' });

    const config = getConfig(db);
    expect(config.a).toBe('1');
    expect(config.b).toBe('20');
    expect(config.c).toBe('3');
    expect(config.d).toBe('4');
    expect(Object.keys(config).length).toBe(baseKeyCount + 4);
  });
});

describe('redactSensitiveConfig', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it.each([
    ['openaiApiKey', true],
    ['openai.apiKey', true],
    ['openai_api_key', true],
    ['openai-api-key', true],
    ['paperlessApiToken', true],
    ['paperless.apiToken', true],
    ['paperless_api_token', true],
    ['paperless-api-token', true],
    ['clientSecret', true],
    ['client.secret', true],
    ['secretKey', true],
    ['clientSecretKey', true],
    ['privateKey', true],
    ['accessToken', true],
    ['access_token', true],
    ['databasePassword', true],
    ['database-password', true],
    ['paperlessUrl', true],
    ['paperless-url', true],
    ['tokenBucketSize', false],
    ['secretaryName', false],
    ['passwordPolicyEnabled', false],
    ['apiVersion', false],
  ])('classifies %s as sensitive=%s', (key, expected) => {
    expect(isSensitiveConfigKey(key)).toBe(expected);
  });

  it('removes environment-owned connection settings and every known credential key', () => {
    const redacted = redactSensitiveConfig({
      'paperless.url': 'http://localhost:8000',
      'paperless.apiToken': 'token-123',
      'paperless.username': 'alice',
      'paperless.password': 'super-secret',
      paperless_url: 'http://legacy-paperless:8000',
      api_token: 'legacy-token',
      AI_OPENAI_API_KEY: 'sk-legacy-key',
      'openai.apiKey': 'sk-config-key',
      theme: 'dark',
    });

    expect(redacted.theme).toBe('dark');
    expect(redacted['paperless.url']).toBeUndefined();
    expect(redacted['paperless.apiToken']).toBeUndefined();
    expect(redacted['paperless.username']).toBeUndefined();
    expect(redacted['paperless.password']).toBeUndefined();
    expect(redacted.paperless_url).toBeUndefined();
    expect(redacted.api_token).toBeUndefined();
    expect(redacted.AI_OPENAI_API_KEY).toBeUndefined();
    expect(redacted['openai.apiKey']).toBeUndefined();
  });

  it('does not write environment-owned connection settings into app_config', () => {
    setConfigBatch(db, {
      'paperless.url': 'http://localhost:8000',
      'paperless.apiToken': 'token-123',
      'paperless.username': 'alice',
      'paperless.password': 'super-secret',
      theme: 'dark',
    });

    const config = getConfig(db);
    expect(config).not.toHaveProperty('paperless.url');
    expect(config).not.toHaveProperty('paperless.apiToken');
    expect(config).not.toHaveProperty('paperless.username');
    expect(config).not.toHaveProperty('paperless.password');
    expect(config.theme).toBe('dark');
  });

  it('does not persist camelCase credential keys', () => {
    setConfigBatch(db, {
      openaiApiKey: 'key',
      paperlessApiToken: 'token',
      clientSecret: 'secret',
      secretKey: 'secret-key',
      clientSecretKey: 'client-secret-key',
      privateKey: 'private-key',
      accessToken: 'token',
      databasePassword: 'password',
      paperlessUrl: 'http://paperless.example.test',
      'paperless-url': 'http://paperless.example.test',
      theme: 'dark',
    });

    expect(getConfig(db)).toMatchObject({ theme: 'dark' });
    for (const key of [
      'openaiApiKey',
      'paperlessApiToken',
      'clientSecret',
      'secretKey',
      'clientSecretKey',
      'privateKey',
      'accessToken',
      'databasePassword',
      'paperlessUrl',
      'paperless-url',
    ]) {
      expect(getConfig(db)).not.toHaveProperty(key);
    }
  });
});

describe('connection-setting migration', () => {
  it('removes legacy Paperless connection settings from app_config', async () => {
    const handle = createDatabaseWithHandle(':memory:');
    const now = new Date().toISOString();
    handle.sqlite.exec(`
      CREATE TABLE app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const insert = handle.sqlite.prepare(
      'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
    );
    insert.run('paperless.url', 'http://legacy-paperless:8000', now);
    insert.run('paperless.apiToken', 'legacy-token', now);
    insert.run('paperless.username', 'alice', now);
    insert.run('paperless.password', 'legacy-password', now);
    insert.run('theme', 'dark', now);

    await migrateDatabase(handle.sqlite);

    const remaining = handle.sqlite
      .prepare('SELECT key FROM app_config WHERE key NOT LIKE ? ORDER BY key')
      .all('schema_ddl_%') as { key: string }[];
    expect(remaining).toEqual([
      { key: 'automation.aiMaxDocumentsPerRun' },
      { key: 'automation.aiMonthlyBudgetUsd' },
      { key: 'theme' },
    ]);
  });
});
