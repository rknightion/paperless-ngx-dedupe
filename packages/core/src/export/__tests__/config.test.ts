import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { setConfig, getConfig } from '../../queries/config.js';
import { getDedupConfig } from '../../dedup/config.js';
import { DEFAULT_DEDUP_CONFIG } from '../../dedup/types.js';
import { exportConfig, importConfig } from '../config.js';

let db: AppDatabase;
let sqlite: Database.Database;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  sqlite = handle.sqlite;
  await migrateDatabase(handle.sqlite);
});

describe('exportConfig', () => {
  it('excludes schema_ddl_ keys from appConfig', () => {
    setConfig(db, 'schema_ddl_hash', 'abc123');
    setConfig(db, 'schema_ddl_snapshot', 'CREATE TABLE...');
    setConfig(db, 'theme', 'dark');

    const backup = exportConfig(db);

    expect(backup.appConfig).not.toHaveProperty('schema_ddl_hash');
    expect(backup.appConfig).not.toHaveProperty('schema_ddl_snapshot');
    expect(backup.appConfig.theme).toBe('dark');
  });

  it('filters legacy stored credential rows from backups', () => {
    const now = new Date().toISOString();
    const insert = sqlite.prepare(
      'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
    );
    for (const [key, value] of [
      ['paperless.url', 'http://paperless.example.test'],
      ['paperless.apiToken', 'paperless-secret'],
      ['openaiApiKey', 'openai-api-key'],
      ['paperlessApiToken', 'paperless-api-token'],
      ['clientSecret', 'client-secret'],
      ['secretKey', 'secret-key'],
      ['clientSecretKey', 'client-secret-key'],
      ['privateKey', 'private-key'],
      ['accessToken', 'access-token'],
      ['databasePassword', 'database-password'],
      ['paperlessUrl', 'http://paperless.example.test'],
      ['paperless-url', 'http://legacy-paperless.example.test'],
    ]) {
      insert.run(key, value, now);
    }
    setConfig(db, 'theme', 'dark');

    const backup = exportConfig(db);

    for (const secret of [
      'paperless-secret',
      'openai-api-key',
      'paperless-api-token',
      'client-secret',
      'secret-key',
      'client-secret-key',
      'private-key',
      'access-token',
      'database-password',
    ]) {
      expect(JSON.stringify(backup)).not.toContain(secret);
    }
    expect(backup.appConfig).toEqual({ theme: 'dark' });
  });

  it('includes dedupConfig', () => {
    const backup = exportConfig(db);

    expect(backup.dedupConfig).toEqual(DEFAULT_DEDUP_CONFIG);
    expect(backup.version).toBe('1.0');
    expect(backup.exportedAt).toBeTruthy();
  });
});

describe('importConfig', () => {
  it('imports valid mutable data while discarding obsolete connection settings', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {
        paperless_url: 'http://localhost:8000',
        api_token: 'secret',
        'paperless.apiToken': 'new-secret',
        AI_OPENAI_API_KEY: 'sk-secret',
        openaiApiKey: 'openai-key',
        clientSecret: 'client-secret',
        accessToken: 'access-token',
        databasePassword: 'database-password',
        secretKey: 'secret-key',
        clientSecretKey: 'client-secret-key',
        privateKey: 'private-key',
        paperlessUrl: 'http://paperless.example.test',
        'paperless-url': 'http://legacy-paperless.example.test',
        theme: 'dark',
      },
      dedupConfig: {
        ...DEFAULT_DEDUP_CONFIG,
        minWords: 50,
      },
    };

    const result = importConfig(db, data);

    expect(result.appConfigKeys).toBe(1);
    expect(result.dedupConfigUpdated).toBe(true);

    const config = getConfig(db);
    expect(config).not.toHaveProperty('paperless_url');
    expect(config).not.toHaveProperty('api_token');
    expect(config).not.toHaveProperty('paperless.apiToken');
    expect(config).not.toHaveProperty('AI_OPENAI_API_KEY');
    expect(config).not.toHaveProperty('openaiApiKey');
    expect(config).not.toHaveProperty('clientSecret');
    expect(config).not.toHaveProperty('accessToken');
    expect(config).not.toHaveProperty('databasePassword');
    expect(config).not.toHaveProperty('secretKey');
    expect(config).not.toHaveProperty('clientSecretKey');
    expect(config).not.toHaveProperty('privateKey');
    expect(config).not.toHaveProperty('paperlessUrl');
    expect(config).not.toHaveProperty('paperless-url');
    expect(config.theme).toBe('dark');

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
        theme: 'dark',
      },
      dedupConfig: DEFAULT_DEDUP_CONFIG,
    };

    const result = importConfig(db, data);

    expect(result.appConfigKeys).toBe(1);

    const config = getConfig(db);
    expect(config.theme).toBe('dark');
    // schema_ddl_ keys from import should not overwrite existing ones
  });

  it('imports 1.1.0 backup with 3-weight config (backward compat)', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-01T00:00:00Z',
      appConfig: {},
      dedupConfig: {
        numPermutations: 256,
        numBands: 32,
        ngramSize: 3,
        minWords: 20,
        similarityThreshold: 0.75,
        confidenceWeightJaccard: 50,
        confidenceWeightFuzzy: 35,
        confidenceWeightDiscriminative: 15,
        fuzzySampleSize: 10000,
        autoAnalyze: true,
      },
    };

    const result = importConfig(db, data);
    expect(result.dedupConfigUpdated).toBe(true);

    const dedupConfig = getDedupConfig(db);
    // J+F redistributed to sum to 100
    expect(dedupConfig.confidenceWeightJaccard + dedupConfig.confidenceWeightFuzzy).toBe(100);
    // Penalty strength derived from old D weight
    expect(dedupConfig.discriminativePenaltyStrength).toBe(70);
    // Old field should not exist
    expect('confidenceWeightDiscriminative' in dedupConfig).toBe(false);
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
