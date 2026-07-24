import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';

import type { AppDatabase } from '../db/client.js';
import { createDatabaseWithHandle } from '../db/client.js';
import { listAiReviewInbox } from '../ai/queries.js';
import { listJobHistory } from '../jobs/manager.js';
import { getDocumentStats, listDocumentLibrary } from '../queries/documents.js';
import { listDuplicateInbox } from '../queries/duplicates.js';
import {
  createSyntheticBenchmarkFixture,
  readSyntheticBenchmarkMetadata,
  SYNTHETIC_BENCHMARK_SIZES,
  type SyntheticBenchmarkMetadata,
} from './fixtures.js';
import { collectBenchmarkQueryPlans, type BenchmarkQueryPlanReceipt } from './query-plans.js';

export type LibraryBenchmarkName =
  | 'overview'
  | 'library-default'
  | 'library-missing-ocr'
  | 'library-tag'
  | 'duplicate-inbox'
  | 'ai-inbox'
  | 'job-history';

export interface DurationSummary {
  minimumMs: number;
  medianMs: number;
  p95Ms: number;
  maximumMs: number;
}

export interface LibraryBenchmarkResult extends DurationSummary {
  name: LibraryBenchmarkName;
  /** A fresh SQLite connection, not a guaranteed cold OS page cache. */
  freshConnectionMs: number;
  sampleCount: number;
}

export interface LibraryBenchmarkReceipt {
  measuredAt: string;
  fixture: SyntheticBenchmarkMetadata;
  methodology: {
    freshConnectionsPerScenario: 1;
    warmupIterations: number;
    sampleCount: number;
    percentiles: ['median', 'p95'];
  };
  runtime: {
    nodeVersion: string;
    platform: NodeJS.Platform;
    architecture: string;
    cpuModel: string;
    cpuCount: number;
    totalMemoryBytes: number;
    sqliteVersion: string;
  };
  benchmarks: LibraryBenchmarkResult[];
  queryPlans: BenchmarkQueryPlanReceipt[];
  recommendations: {
    area: string;
    recommendation: string;
    evidence: string;
  }[];
}

export interface RunLibraryBenchmarksOptions {
  path: string;
  warmupIterations?: number;
  sampleCount?: number;
}

export interface RunStandardSyntheticBenchmarkHarnessOptions {
  documentCounts?: readonly number[];
  warmupIterations?: number;
  sampleCount?: number;
}

export type BenchmarkScenario = {
  name: LibraryBenchmarkName;
  run(db: AppDatabase): unknown;
};

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
  {
    name: 'overview',
    run: (db) => getDocumentStats(db),
  },
  {
    name: 'library-default',
    run: (db) => listDocumentLibrary(db, { duplicate: 'any', limit: 100 }),
  },
  {
    name: 'library-missing-ocr',
    run: (db) => listDocumentLibrary(db, { duplicate: 'any', missingOcr: true, limit: 100 }),
  },
  {
    name: 'library-tag',
    run: (db) => listDocumentLibrary(db, { duplicate: 'any', tag: 'synthetic-even', limit: 100 }),
  },
  {
    name: 'duplicate-inbox',
    run: (db) => listDuplicateInbox(db, { queue: 'pending', limit: 50 }),
  },
  {
    name: 'ai-inbox',
    run: (db) => listAiReviewInbox(db, { queue: 'review', limit: 100 }),
  },
  {
    name: 'job-history',
    run: (db) => listJobHistory(db, { type: 'analysis', status: 'completed', limit: 100 }),
  },
] as const;

function nearestRank(sorted: readonly number[], percentile: number): number {
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

export function summarizeDurations(durations: readonly number[]): DurationSummary {
  if (durations.length === 0) throw new Error('At least one duration is required');
  const sorted = [...durations].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    minimumMs: sorted[0],
    medianMs: median,
    p95Ms: nearestRank(sorted, 0.95),
    maximumMs: sorted.at(-1)!,
  };
}

function measure(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function freshConnectionDuration(path: string, scenario: BenchmarkScenario): number {
  const handle = createDatabaseWithHandle(path);
  try {
    handle.sqlite.pragma('shrink_memory');
    return measure(() => scenario.run(handle.db));
  } finally {
    handle.sqlite.close();
  }
}

export function runLibraryBenchmarks(
  options: RunLibraryBenchmarksOptions,
): LibraryBenchmarkReceipt {
  const warmupIterations = options.warmupIterations ?? 3;
  const sampleCount = options.sampleCount ?? 20;
  if (
    !Number.isInteger(warmupIterations) ||
    warmupIterations < 0 ||
    !Number.isInteger(sampleCount) ||
    sampleCount < 1
  ) {
    throw new Error('Benchmark iterations must be non-negative integers with at least one sample');
  }

  const warmHandle = createDatabaseWithHandle(options.path);
  try {
    const fixture = readSyntheticBenchmarkMetadata(warmHandle.sqlite);
    const benchmarks = BENCHMARK_SCENARIOS.map((scenario): LibraryBenchmarkResult => {
      const freshConnectionMs = freshConnectionDuration(options.path, scenario);
      for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
        scenario.run(warmHandle.db);
      }
      const durations = Array.from({ length: sampleCount }, () =>
        measure(() => scenario.run(warmHandle.db)),
      );
      return {
        name: scenario.name,
        freshConnectionMs,
        sampleCount,
        ...summarizeDurations(durations),
      };
    });
    const queryPlans = collectBenchmarkQueryPlans(
      warmHandle.sqlite,
      warmHandle.db,
      BENCHMARK_SCENARIOS,
    );
    const sqliteVersion = (
      warmHandle.sqlite.prepare('SELECT sqlite_version() AS version').get() as {
        version: string;
      }
    ).version;
    const cpuList = cpus();
    const recommendations = queryPlans
      .filter(({ name, hasTemporarySort }) => name === 'ai-inbox' && hasTemporarySort)
      .map(() => ({
        area: 'ai-inbox',
        recommendation:
          'Measure a persisted confidence-rank expression index before changing the schema.',
        evidence:
          'EXPLAIN QUERY PLAN reports a temporary order-by tree for the computed confidence ranking.',
      }));

    return {
      measuredAt: new Date().toISOString(),
      fixture,
      methodology: {
        freshConnectionsPerScenario: 1,
        warmupIterations,
        sampleCount,
        percentiles: ['median', 'p95'],
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        cpuModel: cpuList[0]?.model ?? 'unknown',
        cpuCount: cpuList.length,
        totalMemoryBytes: totalmem(),
        sqliteVersion,
      },
      benchmarks,
      queryPlans,
      recommendations,
    };
  } finally {
    warmHandle.sqlite.close();
  }
}

/**
 * The normal entry point owns temporary synthetic fixtures and disposes each
 * one even when an individual benchmark fails.
 */
export async function runStandardSyntheticBenchmarkHarness(
  options: RunStandardSyntheticBenchmarkHarnessOptions = {},
): Promise<LibraryBenchmarkReceipt[]> {
  const documentCounts = options.documentCounts ?? SYNTHETIC_BENCHMARK_SIZES;
  const receipts: LibraryBenchmarkReceipt[] = [];
  for (const documentCount of documentCounts) {
    const fixture = await createSyntheticBenchmarkFixture({ documentCount });
    try {
      receipts.push(
        runLibraryBenchmarks({
          path: fixture.path,
          warmupIterations: options.warmupIterations,
          sampleCount: options.sampleCount,
        }),
      );
    } finally {
      fixture.dispose();
    }
  }
  return receipts;
}
