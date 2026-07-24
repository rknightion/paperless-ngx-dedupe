import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSyntheticBenchmarkFixture, type SyntheticBenchmarkFixture } from '../fixtures.js';
import {
  runLibraryBenchmarks,
  runStandardSyntheticBenchmarkHarness,
  summarizeDurations,
} from '../library.bench.js';
import { assertBenchmarkQueryPlanContracts } from '../query-plans.js';

describe('library benchmark runner', () => {
  let fixture: SyntheticBenchmarkFixture;

  beforeEach(async () => {
    fixture = await createSyntheticBenchmarkFixture({ documentCount: 200 });
  });

  afterEach(() => fixture.dispose());

  it('calculates median and nearest-rank p95 independent of input order', () => {
    expect(summarizeDurations([10, 2, 6, 4, 8])).toEqual({
      minimumMs: 2,
      medianMs: 6,
      p95Ms: 10,
      maximumMs: 10,
    });
    expect(summarizeDurations([0.25])).toEqual({
      minimumMs: 0.25,
      medianMs: 0.25,
      p95Ms: 0.25,
      maximumMs: 0.25,
    });
  });

  it('measures real workflows and emits only bounded synthetic receipts', () => {
    const receipt = runLibraryBenchmarks({
      path: fixture.path,
      warmupIterations: 1,
      sampleCount: 2,
    });

    expect(receipt.methodology).toEqual({
      freshConnectionsPerScenario: 1,
      warmupIterations: 1,
      sampleCount: 2,
      percentiles: ['median', 'p95'],
    });
    expect(receipt.benchmarks.map(({ name }) => name)).toEqual([
      'overview',
      'library-default',
      'library-missing-ocr',
      'library-tag',
      'duplicate-inbox',
      'ai-inbox',
      'job-history',
    ]);
    for (const result of receipt.benchmarks) {
      expect(result).toMatchObject({
        freshConnectionMs: expect.any(Number),
        medianMs: expect.any(Number),
        p95Ms: expect.any(Number),
        minimumMs: expect.any(Number),
        maximumMs: expect.any(Number),
        sampleCount: 2,
      });
      expect(result).not.toHaveProperty('coldMs');
      expect(result.freshConnectionMs).toBeGreaterThanOrEqual(0);
      expect(result.p95Ms).toBeGreaterThanOrEqual(result.medianMs);
    }

    expect(() => assertBenchmarkQueryPlanContracts(receipt.queryPlans)).not.toThrow();
    for (const plan of receipt.queryPlans) {
      // A plan receipt must be derived from the exact read statements invoked
      // by its benchmark scenario, rather than a hand-written SQL surrogate.
      expect(plan.statements.length).toBeGreaterThan(0);
      expect(plan.statements.every((statement) => statement.details.length > 0)).toBe(true);
    }
    expect(receipt.runtime).toMatchObject({
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpuModel: expect.any(String),
      cpuCount: expect.any(Number),
      totalMemoryBytes: expect.any(Number),
      sqliteVersion: expect.any(String),
    });
    expect(receipt.fixture).toEqual(fixture.metadata);
    expect(receipt.fixture).toMatchObject({
      synthetic: true,
      schema: {
        userVersion: expect.any(Number),
        ddlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /Synthetic Document|synthetic benchmark text|suggested_title|error_message|full_text/i,
    );
  });

  it.each([
    { warmupIterations: -1, sampleCount: 2 },
    { warmupIterations: 1.5, sampleCount: 2 },
    { warmupIterations: 1, sampleCount: 0 },
    { warmupIterations: 1, sampleCount: 2.5 },
  ])('rejects invalid methodology %j', (methodology) => {
    expect(() =>
      runLibraryBenchmarks({
        path: fixture.path,
        ...methodology,
      }),
    ).toThrow('Benchmark iterations must be non-negative integers with at least one sample');
  });

  it('rejects an unmarked or cardinality-mismatched database instead of trusting caller data', () => {
    fixture.sqlite
      .prepare(
        `UPDATE app_config SET value = json_set(value, '$.documentCount', 999999)
                WHERE key = 'synthetic_benchmark_fixture'`,
      )
      .run();

    expect(() =>
      runLibraryBenchmarks({
        path: fixture.path,
        warmupIterations: 0,
        sampleCount: 1,
      }),
    ).toThrow('cardinality does not match its marker');
  });

  it('provides one normal entry point that owns fixtures for both target scales', async () => {
    const receipts = await runStandardSyntheticBenchmarkHarness({
      documentCounts: [100, 200],
      warmupIterations: 0,
      sampleCount: 1,
    });

    expect(receipts.map(({ fixture }) => fixture.documentCount)).toEqual([100, 200]);
    expect(receipts.every(({ benchmarks }) => benchmarks.length === 7)).toBe(true);
  });
});
