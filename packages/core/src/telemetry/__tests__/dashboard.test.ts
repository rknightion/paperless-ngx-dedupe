import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

const instruments = vi.hoisted(() => new Map<string, 'counter' | 'histogram' | 'gauge'>());
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: (name: string) => {
        instruments.set(name, 'counter');
        return { add() {} };
      },
      createHistogram: (name: string) => {
        instruments.set(name, 'histogram');
        return { record() {} };
      },
      createObservableGauge: (name: string) => {
        instruments.set(name, 'gauge');
        return { addCallback() {} };
      },
    }),
  },
}));
import * as metrics from '../metrics.js';

it('references only defined telemetry instruments in the shipped dashboard', () => {
  for (const [name, factory] of Object.entries(metrics)) {
    if (name !== 'registerObservableGauges') (factory as () => unknown)();
  }
  metrics.registerObservableGauges(() => ({
    documentsCount: 0,
    unresolvedDuplicatesCount: 0,
    activeJobsCount: 0,
  }));
  const available = new Set<string>();
  for (const [name, kind] of instruments) {
    // These exporter suffixes are confirmed by an actual local Prometheus scrape.
    const prometheus = name.replaceAll('.', '_');
    if (kind === 'histogram') {
      for (const suffix of ['_bucket', '_count', '_sum']) available.add(prometheus + suffix);
    } else available.add(prometheus);
  }
  const dashboard: unknown = JSON.parse(
    readFileSync(
      new URL('../../../../../deploy/grafana/paperless-ngx-dedupe.json', import.meta.url),
      'utf8',
    ),
  );
  const expressions: string[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'expr' && typeof child === 'string') expressions.push(child);
      else visit(child);
    }
  }
  visit(dashboard);
  expect(expressions.length).toBeGreaterThan(0);
  const references = expressions.flatMap(
    (expression) => expression.match(/paperless_ngx_dedupe_[a-zA-Z0-9_]+/g) ?? [],
  );
  expect(references.length).toBeGreaterThan(0);
  expect([...new Set(references)].filter((name) => !available.has(name))).toEqual([]);
});
