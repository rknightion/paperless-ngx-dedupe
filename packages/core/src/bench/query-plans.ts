import type Database from 'better-sqlite3';

import type { AppDatabase } from '../db/client.js';

export interface BenchmarkPlanScenario {
  name: string;
  run(db: AppDatabase): unknown;
}

export interface BenchmarkQueryPlanStatement {
  details: string[];
  indexes: string[];
  hasTemporarySort: boolean;
}

export interface BenchmarkQueryPlanReceipt {
  name: string;
  /** One receipt for every real read statement the scenario invoked. */
  statements: BenchmarkQueryPlanStatement[];
  /** Aggregate compatibility fields retained for the first benchmark API. */
  details: string[];
  indexes: string[];
  hasTemporarySort: boolean;
  requiredIndexes: string[];
  forbidTemporarySort: boolean;
  temporarySortJustification: string | null;
}

type ExecutedReadStatement = { sql: string; parameters: unknown[] };

const REQUIRED_INDEXES: Record<string, readonly string[]> = {
  'library-default': ['document_library_added_date_paperless_idx'],
  'duplicate-inbox': ['idx_dg_inbox_order'],
  'job-history': ['job_history_type_status_order_idx'],
};

function normalizePlanDetail(detail: string): string {
  return detail.replace(/\s+/g, ' ').trim().toUpperCase();
}

function indexesFromDetails(details: readonly string[]): string[] {
  const indexes = new Set<string>();
  for (const detail of details) {
    // SQLite wording differs by version (SEARCH/SCAN, COVERING, partial
    // ordering). The index name after INDEX is the stable useful signal.
    const match = detail.match(/\bINDEX\s+([^\s(]+)/i);
    if (match?.[1]) indexes.add(match[1].toLowerCase());
  }
  return [...indexes].sort();
}

function hasTemporarySort(details: readonly string[]): boolean {
  return details.some((detail) => /\bTEMP(?:ORARY)?\s+B-?TREE\b.*\bORDER\b/i.test(detail));
}

function isReadSql(sql: string): boolean {
  return /^\s*(?:SELECT|WITH)\b/i.test(sql);
}

function captureScenarioReads(
  sqlite: Database.Database,
  db: AppDatabase,
  scenario: BenchmarkPlanScenario,
): ExecutedReadStatement[] {
  const originalPrepare = sqlite.prepare;
  const calls: ExecutedReadStatement[] = [];
  const seen = new Set<string>();

  sqlite.prepare = function capturePrepare(this: Database.Database, sql: string) {
    const statement = originalPrepare.call(this, sql);
    if (!isReadSql(sql)) return statement;
    const mutableStatement = statement as unknown as Record<
      string,
      (...parameters: unknown[]) => unknown
    >;
    for (const method of ['all', 'get', 'iterate'] as const) {
      const originalMethod = mutableStatement[method].bind(statement);
      mutableStatement[method] = (...parameters: unknown[]) => {
        const key = `${sql}\u0000${JSON.stringify(parameters)}`;
        if (!seen.has(key)) {
          seen.add(key);
          calls.push({ sql, parameters });
        }
        return originalMethod(...parameters);
      };
    }
    return statement;
  } as Database.Database['prepare'];

  try {
    scenario.run(db);
  } finally {
    sqlite.prepare = originalPrepare;
  }
  return calls;
}

function explainStatement(
  sqlite: Database.Database,
  statement: ExecutedReadStatement,
): BenchmarkQueryPlanStatement {
  const details = (
    sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.parameters) as {
      detail: string;
    }[]
  ).map(({ detail }) => normalizePlanDetail(detail));
  return {
    details,
    indexes: indexesFromDetails(details),
    hasTemporarySort: hasTemporarySort(details),
  };
}

/**
 * Runs every measured workflow through its production query function, records
 * its actual read statements, then explains those exact statements. No row
 * values or bound parameters are returned in the receipt.
 */
export function collectBenchmarkQueryPlans(
  sqlite: Database.Database,
  db: AppDatabase,
  scenarios: readonly BenchmarkPlanScenario[],
): BenchmarkQueryPlanReceipt[] {
  return scenarios.map((scenario) => {
    const statements = captureScenarioReads(sqlite, db, scenario).map((statement) =>
      explainStatement(sqlite, statement),
    );
    const details = statements.flatMap((statement) => statement.details);
    const indexes = [...new Set(statements.flatMap((statement) => statement.indexes))].sort();
    const temporarySort = statements.some((statement) => statement.hasTemporarySort);
    const requiredIndexes = [...(REQUIRED_INDEXES[scenario.name] ?? [])];
    const temporarySortJustification =
      scenario.name === 'ai-inbox' && temporarySort
        ? 'The review inbox intentionally orders by a computed confidence expression; no persisted equivalent currently exists.'
        : scenario.name.startsWith('library-') && temporarySort
          ? 'The library row projection chooses one deterministic duplicate group per document; SQLite currently sorts that bounded correlated subquery.'
          : scenario.name === 'overview' && temporarySort
            ? 'Overview metadata breakdowns group and order bounded aggregate rows rather than an interactive document page.'
            : null;
    return {
      name: scenario.name,
      statements,
      details,
      indexes,
      hasTemporarySort: temporarySort,
      requiredIndexes,
      // The actual workflow can issue multiple read statements. Duplicate and
      // job history should remain index-ordered; the recorded library and
      // overview sorts are documented above rather than hidden by a surrogate.
      forbidTemporarySort: ['duplicate-inbox', 'job-history'].includes(scenario.name),
      temporarySortJustification,
    };
  });
}

export function assertBenchmarkQueryPlanContracts(
  receipts: readonly BenchmarkQueryPlanReceipt[],
): void {
  const failures: string[] = [];
  for (const receipt of receipts) {
    for (const requiredIndex of receipt.requiredIndexes) {
      if (!receipt.indexes.includes(requiredIndex)) {
        failures.push(`${receipt.name} is missing required index ${requiredIndex}`);
      }
    }
    if (receipt.forbidTemporarySort && receipt.hasTemporarySort) {
      failures.push(`${receipt.name} uses an unjustified temporary sort`);
    }
    if (receipt.hasTemporarySort && !receipt.temporarySortJustification) {
      failures.push(`${receipt.name} has no temporary sort justification`);
    }
    if (receipt.statements.length === 0) {
      failures.push(`${receipt.name} did not execute a readable statement`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Benchmark query-plan contract failed: ${failures.join('; ')}`);
  }
}
