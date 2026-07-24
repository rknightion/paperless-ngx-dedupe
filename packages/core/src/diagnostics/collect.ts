import type Database from 'better-sqlite3';

import {
  redactDiagnosticVersion,
  redactJobCategory,
  redactOutcome,
  redactReadinessCategory,
  type DiagnosticJobCategory,
  type DiagnosticOutcome,
  type DiagnosticReadinessCategory,
} from './redact.js';

const RECENT_OUTCOME_LIMIT = 25;

export interface DiagnosticsInput {
  versions: {
    application: unknown;
    node: unknown;
  };
  featureFlags: {
    aiProcessing: boolean;
    paperlessMetrics: boolean;
    frontendTelemetry: boolean;
    continuousProfiling: boolean;
  };
  readiness: {
    paperless: unknown;
    ai: unknown;
  };
}

export interface DiagnosticsBundle {
  formatVersion: 1;
  versions: {
    application: string;
    node: string;
  };
  counts: {
    documents: number;
    duplicateGroups: number;
    pendingDuplicateGroups: number;
    aiResults: number;
    pendingAiResults: number;
    jobs: number;
    failedJobs: number;
  };
  featureFlags: DiagnosticsInput['featureFlags'] & {
    scheduledSync: boolean;
    scheduledAnalysis: boolean;
    scheduledAiProcessing: boolean;
  };
  readiness: {
    database: DiagnosticReadinessCategory;
    paperless: DiagnosticReadinessCategory;
    ai: DiagnosticReadinessCategory;
  };
  database: {
    sqliteUserVersion: number;
    sizeBytes: number;
  };
  recentOutcomes: Array<{
    category: DiagnosticJobCategory;
    outcome: DiagnosticOutcome;
    count: number;
  }>;
}

interface AggregateCounts {
  documents: number;
  duplicateGroups: number;
  pendingDuplicateGroups: number;
  aiResults: number;
  pendingAiResults: number;
  jobs: number;
  failedJobs: number;
}

interface RecentOutcomeRow {
  type: unknown;
  status: unknown;
  createdAt: string;
  id: string;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function collectDiagnostics(
  sqlite: Database.Database,
  input: DiagnosticsInput,
): DiagnosticsBundle {
  const counts = sqlite
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM document) AS documents,
        (SELECT COUNT(*) FROM duplicate_group) AS duplicateGroups,
        (SELECT COUNT(*) FROM duplicate_group WHERE status = 'pending') AS pendingDuplicateGroups,
        (SELECT COUNT(*) FROM ai_processing_result) AS aiResults,
        (
          SELECT COUNT(*) FROM ai_processing_result
          WHERE applied_status = 'pending_review'
        ) AS pendingAiResults,
        (SELECT COUNT(*) FROM job) AS jobs,
        (SELECT COUNT(*) FROM job WHERE status = 'failed') AS failedJobs`,
    )
    .get() as AggregateCounts;

  const enabledSchedules = sqlite
    .prepare(
      `SELECT task
       FROM automation_schedule
       WHERE enabled = 1
         AND task IN ('sync', 'analysis', 'ai_processing')
       ORDER BY task`,
    )
    .all() as Array<{ task: 'sync' | 'analysis' | 'ai_processing' }>;
  const enabledTasks = new Set(enabledSchedules.map((row) => row.task));

  const recentOutcomeStatement = sqlite.prepare(
    `SELECT type, status, created_at AS createdAt, id
     FROM job
     WHERE status = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  );
  const recentRows = (['completed', 'failed', 'cancelled'] as const)
    .flatMap(
      (status) => recentOutcomeStatement.all(status, RECENT_OUTCOME_LIMIT) as RecentOutcomeRow[],
    )
    .sort(
      (left, right) =>
        compareCodeUnits(right.createdAt, left.createdAt) || compareCodeUnits(right.id, left.id),
    )
    .slice(0, RECENT_OUTCOME_LIMIT);

  const outcomeCounts = new Map<string, DiagnosticsBundle['recentOutcomes'][number]>();
  for (const row of recentRows) {
    const outcome = redactOutcome(row.status);
    if (outcome === null) continue;
    const category = redactJobCategory(row.type);
    const key = `${category}\0${outcome}`;
    const existing = outcomeCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      outcomeCounts.set(key, { category, outcome, count: 1 });
    }
  }

  const sqliteUserVersion = sqlite.pragma('user_version', { simple: true });
  const pageCount = sqlite.pragma('page_count', { simple: true });
  const pageSize = sqlite.pragma('page_size', { simple: true });
  const migrationMarkerCount = sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM app_config
       WHERE key IN ('schema_ddl_hash', 'schema_ddl_snapshot')`,
    )
    .get() as { count: number };

  return {
    formatVersion: 1,
    versions: {
      application: redactDiagnosticVersion(input.versions.application),
      node: redactDiagnosticVersion(input.versions.node),
    },
    counts: {
      documents: counts.documents,
      duplicateGroups: counts.duplicateGroups,
      pendingDuplicateGroups: counts.pendingDuplicateGroups,
      aiResults: counts.aiResults,
      pendingAiResults: counts.pendingAiResults,
      jobs: counts.jobs,
      failedJobs: counts.failedJobs,
    },
    featureFlags: {
      aiProcessing: input.featureFlags.aiProcessing === true,
      paperlessMetrics: input.featureFlags.paperlessMetrics === true,
      frontendTelemetry: input.featureFlags.frontendTelemetry === true,
      continuousProfiling: input.featureFlags.continuousProfiling === true,
      scheduledSync: enabledTasks.has('sync'),
      scheduledAnalysis: enabledTasks.has('analysis'),
      scheduledAiProcessing: enabledTasks.has('ai_processing'),
    },
    readiness: {
      database: migrationMarkerCount.count === 2 ? 'configured' : 'unknown',
      paperless: redactReadinessCategory(input.readiness.paperless),
      ai: redactReadinessCategory(input.readiness.ai),
    },
    database: {
      sqliteUserVersion: typeof sqliteUserVersion === 'number' ? sqliteUserVersion : 0,
      sizeBytes:
        typeof pageCount === 'number' && typeof pageSize === 'number' ? pageCount * pageSize : 0,
    },
    recentOutcomes: [...outcomeCounts.values()].sort(
      (left, right) =>
        compareCodeUnits(left.category, right.category) ||
        compareCodeUnits(left.outcome, right.outcome),
    ),
  };
}

export function serializeDiagnostics(bundle: DiagnosticsBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
