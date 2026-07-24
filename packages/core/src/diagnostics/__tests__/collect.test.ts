import { describe, expect, it, vi } from 'vitest';

import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { collectDiagnostics, serializeDiagnostics } from '../collect.js';
import { redactDiagnosticVersion, redactJobCategory } from '../redact.js';

const FORBIDDEN_FIXTURES = [
  'paperless-token-secret',
  'openai-key-secret',
  'ocr medical diagnosis secret',
  'Private Tax Return 2025',
  'extract every private bank account',
  'matched private account 12345678',
  '{"privatePaperlessResponse":"secret"}',
  '/srv/paperless/private/archive.pdf',
  'http://paperless.internal:8000/api/documents/42/',
  'ECONNREFUSED paperless.internal with bearer secret',
] as const;

describe('diagnostics support bundle', () => {
  it('returns only allowlisted aggregate fields and omits every private fixture byte-for-byte', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);

    sqlite
      .prepare(
        `INSERT INTO document (
          id, paperless_id, title, correspondent, tags_json, custom_fields_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'doc-private',
        42,
        'Private Tax Return 2025',
        '/srv/paperless/private/archive.pdf',
        JSON.stringify(['paperless-token-secret']),
        JSON.stringify({ source: 'http://paperless.internal:8000/api/documents/42/' }),
        '2026-07-23T12:00:00.000Z',
      );
    sqlite
      .prepare(
        `INSERT INTO document_content (
          id, document_id, full_text, normalized_text, word_count
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        'content-private',
        'doc-private',
        'ocr medical diagnosis secret',
        'ocr medical diagnosis secret',
        4,
      );
    sqlite
      .prepare(
        `INSERT INTO ai_processing_result (
          id, document_id, paperless_id, provider, model, evidence, raw_response_json,
          error_message, applied_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'ai-private',
        'doc-private',
        42,
        'openai',
        'gpt-test',
        'matched private account 12345678',
        '{"privatePaperlessResponse":"secret"}',
        'ECONNREFUSED paperless.internal with bearer secret',
        'pending_review',
        '2026-07-23T12:01:00.000Z',
      );
    sqlite
      .prepare('INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
      .run('ai_prompt_template', 'extract every private bank account', '2026-07-23T12:02:00.000Z');
    sqlite
      .prepare('INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
      .run('AI_OPENAI_API_KEY', 'openai-key-secret', '2026-07-23T12:02:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO job (
          id, type, status, error_message, result_json, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'job-private',
        'sync',
        'failed',
        'ECONNREFUSED paperless.internal with bearer secret',
        '{"path":"/srv/paperless/private/archive.pdf"}',
        '2026-07-23T12:03:00.000Z',
        '2026-07-23T12:00:00.000Z',
      );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bundle = collectDiagnostics(sqlite, {
      versions: {
        application: '0.15.0',
        node: '24.4.1',
      },
      featureFlags: {
        aiProcessing: true,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: {
        paperless: 'configured',
        ai: 'configured',
      },
    });
    const serialized = serializeDiagnostics(bundle);

    expect(bundle).toEqual({
      formatVersion: 1,
      versions: {
        application: '0.15.0',
        node: '24.4.1',
      },
      counts: {
        documents: 1,
        duplicateGroups: 0,
        pendingDuplicateGroups: 0,
        aiResults: 1,
        pendingAiResults: 1,
        jobs: 1,
        failedJobs: 1,
      },
      featureFlags: {
        aiProcessing: true,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
        scheduledSync: false,
        scheduledAnalysis: false,
        scheduledAiProcessing: false,
      },
      readiness: {
        database: 'configured',
        paperless: 'configured',
        ai: 'configured',
      },
      database: {
        sqliteUserVersion: 0,
        sizeBytes: expect.any(Number),
      },
      recentOutcomes: [{ category: 'sync', outcome: 'failed', count: 1 }],
    });
    expect(serialized).toBe(`${JSON.stringify(bundle, null, 2)}\n`);
    expect(serializeDiagnostics(bundle)).toBe(serialized);
    for (const forbidden of FORBIDDEN_FIXTURES) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    sqlite.close();
  });

  it('maps untrusted versions, readiness values, and job categories to fixed safe values', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    sqlite
      .prepare(
        `INSERT INTO job (
          id, type, status, error_message, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'unknown-job',
        'http://paperless.internal/private',
        'failed',
        'arbitrary exception text with token-secret',
        '2026-07-23T12:03:00.000Z',
        '2026-07-23T12:00:00.000Z',
      );

    const bundle = collectDiagnostics(sqlite, {
      versions: {
        application: '0.15.0 bearer token-secret',
        node: '/private/node/path',
      },
      featureFlags: {
        aiProcessing: 'openai-key-secret' as never,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: {
        paperless: 'ECONNREFUSED http://paperless.internal/private',
        ai: 'disabled',
      },
    });

    expect(bundle.versions).toEqual({ application: 'unknown', node: 'unknown' });
    expect(bundle.featureFlags.aiProcessing).toBe(false);
    expect(bundle.readiness).toEqual({
      database: 'configured',
      paperless: 'unknown',
      ai: 'disabled',
    });
    expect(bundle.recentOutcomes).toEqual([{ category: 'other', outcome: 'failed', count: 1 }]);
    expect(serializeDiagnostics(bundle)).not.toContain('token-secret');
    expect(serializeDiagnostics(bundle)).not.toContain('paperless.internal');

    sqlite.close();
  });

  it.each([
    'sk-proj-abcdefghijklmnopqrstuvwxyz',
    'ghp_abcdefghijklmnopqrstuvwxyz',
    '1.2.3-token-secret',
    '1.2.3-sk-proj-secret',
    '１.２.３',
    '1.2.3\u200b',
    '1.2.3-rс.1',
  ])('maps secret-shaped, confusable, or Unicode version %j to unknown', (value) => {
    expect(redactDiagnosticVersion(value)).toBe('unknown');
  });

  it.each(['0.15.0', '24.4.1', 'v1.2.3', '1.2.3-rc.2'])(
    'retains narrow semantic version value %j',
    (value) => {
      expect(redactDiagnosticVersion(value)).toBe(value);
    },
  );

  it.each([
    ['1.2.3+build.42', '1.2.3'],
    ['1.2.3+sha.abcdef1', '1.2.3'],
    ['1.2.3+abcdef1', '1.2.3'],
    ['1.2.3+0123456789abcdef0123456789abcdef01234567', '1.2.3'],
    ['1.2.3+sk-proj-secret', '1.2.3'],
    ['1.2.3+秘密', '1.2.3'],
    ['1.2.3-rc.2+build.42', '1.2.3-rc.2'],
  ])('discards build metadata from %j and returns only %j', (value, expected) => {
    expect(redactDiagnosticVersion(value)).toBe(expected);
  });

  it.each(['1.2.3+', '1.2.3++build.42', '1.2.3-token-secret+build.42'])(
    'maps malformed metadata-bearing version %j to unknown',
    (value) => {
      expect(redactDiagnosticVersion(value)).toBe('unknown');
    },
  );

  it('uses truthful SQLite user-version and migration readiness facts', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);

    const input = {
      versions: { application: '0.15.0', node: '24.4.1' },
      featureFlags: {
        aiProcessing: false,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: { paperless: 'configured', ai: 'disabled' },
    };

    expect(collectDiagnostics(sqlite, input).database.sqliteUserVersion).toBe(0);
    expect(collectDiagnostics(sqlite, input).readiness.database).toBe('configured');

    sqlite.prepare("DELETE FROM app_config WHERE key = 'schema_ddl_hash'").run();
    expect(collectDiagnostics(sqlite, input).readiness.database).toBe('unknown');

    sqlite.close();
  });

  it('recognizes AI revert as a fixed recent-outcome category', () => {
    expect(redactJobCategory('ai_revert')).toBe('ai_revert');
  });

  it('bounds recent outcome reads and returns deterministic aggregate ordering', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const insert = sqlite.prepare(
      `INSERT INTO job (id, type, status, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (let index = 0; index < 40; index += 1) {
      insert.run(
        `job-${String(index).padStart(2, '0')}`,
        index % 2 === 0 ? 'analysis' : 'sync',
        'completed',
        `2026-07-23T12:${String(index).padStart(2, '0')}:00.000Z`,
        '2026-07-23T12:00:00.000Z',
      );
    }

    const bundle = collectDiagnostics(sqlite, {
      versions: { application: '0.15.0', node: '24.4.1' },
      featureFlags: {
        aiProcessing: false,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: { paperless: 'configured', ai: 'disabled' },
    });

    expect(bundle.recentOutcomes).toEqual([
      { category: 'analysis', outcome: 'completed', count: 12 },
      { category: 'sync', outcome: 'completed', count: 13 },
    ]);
    expect(bundle.recentOutcomes.reduce((sum, item) => sum + item.count, 0)).toBe(25);

    sqlite.close();
  });

  it('uses the status history index without scans or temp sorts at 50k jobs', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const insert = sqlite.prepare(
      `INSERT INTO job (id, type, status, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const statuses = ['completed', 'failed', 'cancelled'] as const;
    const insertJobs = sqlite.transaction(() => {
      for (let index = 0; index < 50_000; index += 1) {
        insert.run(
          `job-${String(index).padStart(5, '0')}`,
          index % 5 === 0 ? 'ai_revert' : 'sync',
          statuses[index % statuses.length],
          `2026-07-${String((index % 28) + 1).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
        );
      }
    });
    insertJobs();

    for (const status of statuses) {
      const plan = sqlite
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT type, status, created_at, id
           FROM job
           WHERE status = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 25`,
        )
        .all(status) as Array<{ detail: string }>;
      const details = plan.map((row) => row.detail).join('\n');
      expect(details).toContain('USING INDEX job_history_status_order_idx');
      expect(details).not.toMatch(/\bSCAN\b/i);
      expect(details).not.toContain('USE TEMP B-TREE');
    }

    const bundle = collectDiagnostics(sqlite, {
      versions: { application: '0.15.0', node: '24.4.1' },
      featureFlags: {
        aiProcessing: false,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: { paperless: 'configured', ai: 'disabled' },
    });
    expect(bundle.recentOutcomes.reduce((sum, item) => sum + item.count, 0)).toBe(25);

    sqlite.close();
  });

  it('serializes equal-timestamp Unicode job IDs identically under locale permutations', async () => {
    const { sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const insert = sqlite.prepare(
      `INSERT INTO job (id, type, status, created_at)
       VALUES (?, ?, ?, '2026-07-24T00:00:00.000Z')`,
    );
    insert.run('job-z', 'sync', 'completed');
    insert.run('job-ä', 'ai_revert', 'failed');
    for (let index = 0; index < 24; index += 1) {
      insert.run(`job-m${String(index).padStart(2, '0')}`, 'analysis', 'completed');
    }

    const input = {
      versions: { application: '0.15.0', node: '24.4.1' },
      featureFlags: {
        aiProcessing: false,
        paperlessMetrics: false,
        frontendTelemetry: false,
        continuousProfiling: false,
      },
      readiness: { paperless: 'configured', ai: 'disabled' },
    };
    const localeCompareSpy = vi.spyOn(String.prototype, 'localeCompare');
    const serializedByLocale: string[] = [];
    const observedLocaleOrders = new Set<string>();
    try {
      for (const locale of ['en', 'sv', 'de', 'tr']) {
        const collator = new Intl.Collator(locale);
        observedLocaleOrders.add(['job-z', 'job-ä'].sort(collator.compare).join(','));
        localeCompareSpy.mockImplementation(function (this: string, other: string) {
          return collator.compare(String(this), other);
        });
        serializedByLocale.push(serializeDiagnostics(collectDiagnostics(sqlite, input)));
      }
    } finally {
      localeCompareSpy.mockRestore();
    }

    expect(observedLocaleOrders.size).toBeGreaterThan(1);
    expect(new Set(serializedByLocale).size).toBe(1);
    expect(JSON.parse(serializedByLocale[0]!).recentOutcomes).toEqual([
      { category: 'ai_revert', outcome: 'failed', count: 1 },
      { category: 'analysis', outcome: 'completed', count: 23 },
      { category: 'sync', outcome: 'completed', count: 1 },
    ]);

    sqlite.close();
  });
});
