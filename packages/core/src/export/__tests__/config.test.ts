import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import type { AppDatabase } from '../../db/client.js';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { DEFAULT_DEDUP_CONFIG } from '../../dedup/types.js';
import { getDedupConfig, setDedupConfig } from '../../dedup/config.js';
import { getConfig, setConfig } from '../../queries/config.js';
import { exportConfig, importConfig, previewConfigImport } from '../config.js';

let db: AppDatabase;
let sqlite: Database.Database;

beforeEach(async () => {
  const handle = createDatabaseWithHandle(':memory:');
  db = handle.db;
  sqlite = handle.sqlite;
  await migrateDatabase(handle.sqlite);
});

function backup(appConfig: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    exportedAt: '2024-01-01T00:00:00Z',
    appConfig,
    dedupConfig: DEFAULT_DEDUP_CONFIG,
  };
}

describe('exportConfig', () => {
  it('exports only registered mutable keys and never stored secrets or internal state', () => {
    const now = new Date().toISOString();
    const insert = sqlite.prepare(
      'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
    );
    for (const [key, value] of [
      ['schema_ddl_hash', 'abc123'],
      ['schema_ddl_snapshot', 'CREATE TABLE secret_data'],
      ['paperless.apiToken', 'paperless-secret'],
      ['AI_OPENAI_API_KEY', 'openai-secret'],
      ['openaiApiKey', 'legacy-openai-secret'],
      ['unknown.safe-looking', 'must-not-export'],
    ]) {
      insert.run(key, value, now);
    }
    setConfig(db, 'ai.model', 'gpt-5.4');
    setConfig(db, 'ai.extractCustomFields', true);

    const result = exportConfig(db);
    const serialized = JSON.stringify(result);

    expect(result.appConfig).toEqual({
      'ai.extractCustomFields': 'true',
      'ai.model': 'gpt-5.4',
      'automation.aiMaxDocumentsPerRun': '25',
      'automation.aiMonthlyBudgetUsd': '0',
    });
    for (const forbidden of [
      'paperless-secret',
      'openai-secret',
      'legacy-openai-secret',
      'must-not-export',
      'CREATE TABLE secret_data',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('includes the current dedup config and format metadata', () => {
    setDedupConfig(db, { minWords: 42 });
    const result = exportConfig(db);

    expect(result.dedupConfig).toEqual({ ...DEFAULT_DEDUP_CONFIG, minWords: 42 });
    expect(Object.keys(result.appConfig).some((key) => key.startsWith('dedup.'))).toBe(false);
    expect(result.version).toBe('1.0');
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('previewConfigImport', () => {
  it('previews the v0.15 auto-process migration and every retired auto-apply key', () => {
    const result = previewConfigImport(
      backup({
        'ai.model': 'gpt-5.4',
        'ai.autoProcess': 'true',
        'ai.autoApplyEnabled': 'true',
        'ai.autoApplyRequireAllAboveThreshold': 'true',
        'ai.autoApplyRequireNoNewEntities': 'true',
        'ai.autoApplyRequireNoClearing': 'true',
        'ai.autoApplyRequireOcrText': 'true',
        'ai.tagsOnlyAutoApply': 'true',
        'ai.neverAutoCreateEntities': 'true',
        'ai.neverOverwriteNonEmpty': 'true',
      }),
    );

    expect(result.appConfig).toEqual({ 'ai.model': 'gpt-5.4' });
    expect(result.deprecatedKeys).toEqual([
      {
        key: 'ai.autoProcess',
        action: 'scheduled_ai_opt_in',
        requiresConfirmation: true,
      },
    ]);
    expect(result.droppedKeys).toEqual([
      'ai.autoApplyEnabled',
      'ai.autoApplyRequireAllAboveThreshold',
      'ai.autoApplyRequireNoClearing',
      'ai.autoApplyRequireNoNewEntities',
      'ai.autoApplyRequireOcrText',
      'ai.neverAutoCreateEntities',
      'ai.neverOverwriteNonEmpty',
      'ai.tagsOnlyAutoApply',
    ]);
    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      requiresConfirmation: true,
    });
  });

  it('rejects unknown, prototype-pollution, and confusable keys', () => {
    for (const key of ['unknown.setting', '__proto__', 'constructor', 'ai．batchSize']) {
      const appConfig = Object.create(null) as Record<string, unknown>;
      Object.defineProperty(appConfig, key, { value: '1', enumerable: true });

      expect(() => previewConfigImport(backup(appConfig))).toThrow();
    }
  });

  it.each(['unknown', '__proto__', 'constructor', 'prototype', 'minＷords'])(
    'rejects unknown or confusable dedup key %s before schema cloning',
    (key) => {
      const dedupConfig = Object.create(null) as Record<string, unknown>;
      for (const [knownKey, value] of Object.entries(DEFAULT_DEDUP_CONFIG)) {
        Object.defineProperty(dedupConfig, knownKey, { value, enumerable: true });
      }
      Object.defineProperty(dedupConfig, key, { value: 50, enumerable: true });

      expect(() =>
        previewConfigImport({
          ...backup(),
          dedupConfig,
        }),
      ).toThrow();
    },
  );

  it('rejects dedup settings duplicated across appConfig and dedupConfig', () => {
    expect(() =>
      previewConfigImport(
        backup({
          'dedup.minWords': '50',
        }),
      ),
    ).toThrow(/dedupConfig/i);
  });

  it('previews known legacy environment and schema keys as dropped without retaining values', () => {
    const result = previewConfigImport(
      backup({
        PAPERLESS_URL: 'https://private.example.test',
        PAPERLESS_API_TOKEN: 'private-token',
        AI_OPENAI_API_KEY: 'sk-private',
        accessToken: 'legacy-access-token',
        openai_api_key: 'legacy-openai-key',
        schema_ddl_hash: 'private-hash',
      }),
    );

    expect(result.appConfig).toEqual({});
    expect(result.droppedKeys).toEqual([
      'AI_OPENAI_API_KEY',
      'PAPERLESS_API_TOKEN',
      'PAPERLESS_URL',
      'accessToken',
      'openai_api_key',
      'schema_ddl_hash',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('sk-private');
    expect(JSON.stringify(result)).not.toContain('legacy-access-token');
  });
});

describe('importConfig', () => {
  it('imports a fully validated batch and dedup settings', () => {
    const result = importConfig(
      db,
      backup({
        'ai.batchSize': '050',
        'ai.extractCustomFields': true,
      }),
    );

    expect(result).toMatchObject({
      appConfigKeys: 2,
      dedupConfigUpdated: true,
      scheduledAiOptIn: {
        requested: false,
        applied: false,
        reason: 'not_requested',
      },
    });
    expect(getConfig(db)).toMatchObject({
      'ai.batchSize': '50',
      'ai.extractCustomFields': 'true',
    });
  });

  it('does not parse an unrelated schedule when no scheduled-AI migration is requested', () => {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET cadence_json = 'not-json'
         WHERE task = 'ai_processing'`,
      )
      .run();

    const result = importConfig(db, backup({ 'ai.model': 'gpt-5.4' }));

    expect(result.scheduledAiOptIn).toEqual({
      requested: false,
      applied: false,
      reason: 'not_requested',
    });
    expect(getConfig(db)['ai.model']).toBe('gpt-5.4');
  });

  it('validates all app settings before changing app or dedup configuration', () => {
    setConfig(db, 'ai.model', 'gpt-5.4-mini');
    const beforeDedup = getDedupConfig(db);

    expect(() =>
      importConfig(db, {
        ...backup({
          'ai.model': 'gpt-5.4',
          'ai.batchSize': 'not-an-integer',
        }),
        dedupConfig: { ...DEFAULT_DEDUP_CONFIG, minWords: 99 },
      }),
    ).toThrow();

    expect(getConfig(db)['ai.model']).toBe('gpt-5.4-mini');
    expect(getDedupConfig(db)).toEqual(beforeDedup);
  });

  it('never enables a deprecated auto-process request without explicit confirmation', () => {
    const result = importConfig(db, backup({ 'ai.autoProcess': 'true' }));
    const schedule = sqlite
      .prepare(
        "SELECT enabled, cadence_json AS cadenceJson FROM automation_schedule WHERE task = 'ai_processing'",
      )
      .get() as { enabled: number; cadenceJson: string };

    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      applied: false,
      reason: 'confirmation_required',
    });
    expect(schedule.enabled).toBe(0);
    expect(getConfig(db)).not.toHaveProperty('ai.autoProcess');
  });

  it('leaves a confirmed request unapplied when the AI schedule is manual', () => {
    const result = importConfig(db, backup({ 'ai.autoProcess': 'true' }), {
      confirmScheduledAiOptIn: true,
    });
    const schedule = sqlite
      .prepare("SELECT enabled FROM automation_schedule WHERE task = 'ai_processing'")
      .get() as { enabled: number };

    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      applied: false,
      reason: 'schedule_not_configured',
    });
    expect(schedule.enabled).toBe(0);
  });

  it('enables only an already-configured AI schedule after explicit confirmation', () => {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET enabled = 0, cadence_json = ?, timezone = 'Europe/London', next_due_at = NULL
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'daily', hour: 3, minute: 15 }));
    sqlite
      .prepare(
        `UPDATE app_config SET value = '5'
         WHERE key = 'automation.aiMonthlyBudgetUsd'`,
      )
      .run();

    const result = importConfig(db, backup({ 'ai.autoProcess': 'true' }), {
      confirmScheduledAiOptIn: true,
    });
    const schedule = sqlite
      .prepare(
        `SELECT enabled, cadence_json AS cadenceJson, timezone
         FROM automation_schedule WHERE task = 'ai_processing'`,
      )
      .get() as { enabled: number; cadenceJson: string; timezone: string };

    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      applied: true,
      reason: 'confirmed',
    });
    expect(schedule).toEqual({
      enabled: 1,
      cadenceJson: JSON.stringify({ kind: 'daily', hour: 3, minute: 15 }),
      timezone: 'Europe/London',
    });
    expect(getConfig(db)).not.toHaveProperty('ai.autoProcess');
  });

  it('leaves a confirmed request unapplied when a scheduled cadence has no budget', () => {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET cadence_json = ?
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'interval', hours: 6 }));

    const result = importConfig(db, backup({ 'ai.autoProcess': 'true' }), {
      confirmScheduledAiOptIn: true,
    });
    const schedule = sqlite
      .prepare("SELECT enabled FROM automation_schedule WHERE task = 'ai_processing'")
      .get() as { enabled: number };

    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      applied: false,
      reason: 'schedule_not_configured',
    });
    expect(schedule.enabled).toBe(0);
  });

  it('does not let the same import bootstrap schedule prerequisites', () => {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET cadence_json = ?
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'interval', hours: 6 }));

    const result = importConfig(
      db,
      backup({
        'ai.autoProcess': 'true',
        'automation.aiMonthlyBudgetUsd': '5',
        'automation.aiMaxDocumentsPerRun': '25',
      }),
      { confirmScheduledAiOptIn: true },
    );

    expect(result.scheduledAiOptIn).toEqual({
      requested: true,
      applied: false,
      reason: 'schedule_not_configured',
    });
    expect(
      sqlite.prepare("SELECT enabled FROM automation_schedule WHERE task = 'ai_processing'").get(),
    ).toEqual({ enabled: 0 });
  });

  it('rejects semantically invalid tag aliases before changing any settings', () => {
    setConfig(db, 'ai.model', 'gpt-5.4-mini');

    expect(() =>
      importConfig(
        db,
        backup({
          'ai.model': 'gpt-5.4',
          'ai.tagAliasMap': '__proto__:\n  - unsafe',
        }),
      ),
    ).toThrow();

    expect(getConfig(db)['ai.model']).toBe('gpt-5.4-mini');
  });

  it('never revives retired auto-apply keys even when schedule opt-in is confirmed', () => {
    sqlite
      .prepare(
        `UPDATE automation_schedule
         SET cadence_json = ?
         WHERE task = 'ai_processing'`,
      )
      .run(JSON.stringify({ kind: 'interval', hours: 6 }));
    sqlite
      .prepare(
        `UPDATE app_config SET value = '5'
         WHERE key = 'automation.aiMonthlyBudgetUsd'`,
      )
      .run();

    importConfig(
      db,
      backup({
        'ai.autoProcess': 'true',
        'ai.autoApplyEnabled': 'true',
        'ai.tagsOnlyAutoApply': 'true',
      }),
      { confirmScheduledAiOptIn: true },
    );

    const retiredRows = sqlite
      .prepare(
        `SELECT key FROM app_config
         WHERE key LIKE 'ai.autoApply%' OR key = 'ai.tagsOnlyAutoApply'`,
      )
      .all();
    expect(retiredRows).toEqual([]);
  });

  it('imports legacy 3-weight dedup configuration', () => {
    const result = importConfig(db, {
      ...backup(),
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
    });

    expect(result.dedupConfigUpdated).toBe(true);
    expect(getDedupConfig(db)).toMatchObject({
      confidenceWeightJaccard: 59,
      confidenceWeightFuzzy: 41,
      discriminativePenaltyStrength: 70,
    });
  });

  it('rejects unsupported backup versions', () => {
    expect(() => importConfig(db, { ...backup(), version: '2.0' })).toThrow();
  });
});
