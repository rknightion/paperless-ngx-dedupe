import { metrics } from '@opentelemetry/api';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { getGaugeStats } from '../gauge-stats.js';
import { registerObservableGauges } from '../metrics.js';

class TestReader extends MetricReader {
  protected async onForceFlush() {}
  protected async onShutdown() {}
}

it('exports stored success times and bounded backlog counts without inventing an initial success', async () => {
  const handle = createDatabaseWithHandle(':memory:');
  const reader = new TestReader();
  const provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
  try {
    await migrateDatabase(handle.sqlite);
    registerObservableGauges(() => getGaugeStats(handle.db));
    const collect = async () => {
      const result = await reader.collect();
      expect(result.errors).toEqual([]);
      return new Map(
        result.resourceMetrics.scopeMetrics.flatMap((scope) =>
          scope.metrics.map((metric) => [metric.descriptor.name, metric.dataPoints] as const),
        ),
      );
    };
    const initial = await collect();
    for (const name of ['sync', 'analysis']) {
      expect(initial.get(`paperless_ngx_dedupe.${name}.last_success_timestamp`) ?? []).toEqual([]);
    }
    expect(initial.get('paperless_ngx_dedupe.duplicates.pending_count')).toEqual([
      expect.objectContaining({ value: 0, attributes: { confidence: 'high' } }),
      expect.objectContaining({ value: 0, attributes: { confidence: 'ambiguous' } }),
    ]);
    expect(initial.get('paperless_ngx_dedupe.jobs.dead_letter_count')).toEqual([
      expect.objectContaining({ value: 0, attributes: {} }),
    ]);
    handle.sqlite
      .prepare(
        `INSERT INTO sync_state (id, last_sync_at, last_analysis_at)
      VALUES ('singleton', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')
      ON CONFLICT(id) DO UPDATE SET last_sync_at=excluded.last_sync_at,last_analysis_at=excluded.last_analysis_at`,
      )
      .run();
    for (const [id, status, confidence] of [
      ['high', 'pending', 0.95],
      ['ambiguous', 'pending', 0.9499],
      ['ignored', 'ignored', 1],
      ['deleted', 'deleted', 0.9],
    ]) {
      handle.sqlite
        .prepare(
          `INSERT INTO duplicate_group (id,status,confidence_score,algorithm_version,created_at,updated_at)
        VALUES (?,?,?,'synthetic','2026-01-01','2026-01-01')`,
        )
        .run(id, status, confidence);
    }
    for (const [index, status] of ['dead_letter', 'dead_letter', 'failed', 'pending'].entries()) {
      handle.sqlite
        .prepare(
          `INSERT INTO dispatch_intent (id,task,operation,trigger_kind,status,created_at,updated_at)
        VALUES (?,'sync','sync','manual',?,'2026-01-01','2026-01-01')`,
        )
        .run(`${status}-${index}`, status);
    }
    const populated = await collect();
    for (const [name, value] of [
      ['sync', 1767225600],
      ['analysis', 1767312000],
    ] as const) {
      expect(populated.get(`paperless_ngx_dedupe.${name}.last_success_timestamp`)).toEqual([
        expect.objectContaining({ value, attributes: {} }),
      ]);
    }
    expect(populated.get('paperless_ngx_dedupe.duplicates.pending_count')).toEqual([
      expect.objectContaining({ value: 1, attributes: { confidence: 'high' } }),
      expect.objectContaining({ value: 1, attributes: { confidence: 'ambiguous' } }),
    ]);
    expect(populated.get('paperless_ngx_dedupe.jobs.dead_letter_count')).toEqual([
      expect.objectContaining({ value: 2, attributes: {} }),
    ]);
    expect(populated.get('paperless_ngx_dedupe.duplicates.unresolved_count')).toEqual([
      expect.objectContaining({ value: 2, attributes: {} }),
    ]);
  } finally {
    await provider.shutdown();
    metrics.disable();
    handle.sqlite.close();
  }
});
