import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { setConfig, getConfig } from '../../queries/config.js';
import { getDedupConfig } from '../../dedup/config.js';
import { DEFAULT_DEDUP_CONFIG } from '../../dedup/types.js';
import { exportConfig, importConfig } from '../config.js';

let db: AppDatabase;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  await migrateDatabase(handle.sqlite);
});

describe('exportConfig', () => {
  it('excludes schema_ddl_ keys from appConfig', () => {
    setConfig(db, 'schema_ddl_hash', 'abc123');
    setConfig(db, 'schema_ddl_snapshot', 'CREATE TABLE...');
    setConfig(db, 'paperless_url', 'http://localhost:8000');

    const backup = exportConfig(db);

    expect(backup.appConfig).not.toHaveProperty('schema_ddl_hash');
    expect(backup.appConfig).not.toHaveProperty('schema_ddl_snapshot');
    expect(backup.appConfig.paperless_url).toBe('http://localhost:8000');
  });

  it('includes dedupConfig', () => {
    const backup = exportConfig(db);

    expect(backup.dedupConfig).toEqual(DEFAULT_DEDUP_CONFIG);
    expect(backup.version).toBe('1.0');
    expect(backup.exportedAt).toBeTruthy();
  });
});

describe('importConfig', () => {
  it('imports valid data successfully', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {
        paperless_url: 'http://localhost:8000',
        api_token: 'secret',
      },
      dedupConfig: {
        ...DEFAULT_DEDUP_CONFIG,
        minWords: 50,
      },
    };

    const result = importConfig(db, data);

    expect(result.appConfigKeys).toBe(2);
    expect(result.dedupConfigUpdated).toBe(true);

    const config = getConfig(db);
    expect(config.paperless_url).toBe('http://localhost:8000');
    expect(config.api_token).toBe('secret');

    const dedupConfig = getDedupConfig(db);
    expect(dedupConfig.minWords).toBe(50);
  });

  it('rejects invalid version', () => {
    const data = {
      version: '2.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {},
      dedupConfig: DEFAULT_DEDUP_CONFIG,
    };

    expect(() => importConfig(db, data)).toThrow();
  });

  it('filters out schema_ddl_ keys from appConfig before applying', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {
        schema_ddl_hash: 'should_be_filtered',
        schema_ddl_snapshot: 'should_also_be_filtered',
        paperless_url: 'http://localhost:8000',
      },
      dedupConfig: DEFAULT_DEDUP_CONFIG,
    };

    const result = importConfig(db, data);

    expect(result.appConfigKeys).toBe(1);

    const config = getConfig(db);
    expect(config.paperless_url).toBe('http://localhost:8000');
    // schema_ddl_ keys from import should not overwrite existing ones
  });

  it('returns correct counts', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {
        key1: 'val1',
        key2: 'val2',
        key3: 'val3',
      },
      dedupConfig: DEFAULT_DEDUP_CONFIG,
    };

    const result = importConfig(db, data);

    expect(result.appConfigKeys).toBe(3);
    expect(result.dedupConfigUpdated).toBe(true);
  });
});
