import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getConfig, setConfig, setConfigBatch } from '../config.js';

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

  it('returns all config rows as key-value pairs', () => {
    setConfig(db, 'paperless_url', 'http://localhost:8000');
    setConfig(db, 'api_token', 'abc123');

    const config = getConfig(db);
    expect(config.paperless_url).toBe('http://localhost:8000');
    expect(config.api_token).toBe('abc123');
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
      paperless_url: 'http://localhost:8000',
      api_token: 'secret',
      theme: 'dark',
    });

    const config = getConfig(db);
    expect(config.paperless_url).toBe('http://localhost:8000');
    expect(config.api_token).toBe('secret');
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
