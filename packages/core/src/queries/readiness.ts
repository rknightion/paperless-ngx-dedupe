import { count, eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import { checkAnalysisStaleness } from '../dedup/analysis-hash.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { syncState } from '../schema/sqlite/app.js';
import { duplicateGroup } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import type { LocalReadiness, NextAction } from './types.js';

const ANALYSIS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function getReadiness(db: AppDatabase, now: Date): LocalReadiness {
  const syncRow = db.select().from(syncState).get();
  const [{ value: failedJobCount }] = db
    .select({ value: count() })
    .from(job)
    .where(eq(job.status, 'failed'))
    .all();
  const [{ value: pendingDuplicateGroups }] = db
    .select({ value: count() })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.status, 'pending'))
    .all();
  const [{ value: pendingAiResults }] = db
    .select({ value: count() })
    .from(aiProcessingResult)
    .where(eq(aiProcessingResult.appliedStatus, 'pending_review'))
    .all();

  const lastSyncAt = syncRow?.lastSyncAt ?? null;
  const lastAnalysisAt = syncRow?.lastAnalysisAt ?? null;
  const staleness = checkAnalysisStaleness(db);
  const analysisStale = isAnalysisStale(lastSyncAt, lastAnalysisAt, now) || staleness.isStale;

  return {
    lastSyncAt,
    lastSyncDocumentCount: syncRow?.lastSyncDocumentCount ?? null,
    lastAnalysisAt,
    totalDuplicateGroups: syncRow?.totalDuplicateGroups ?? null,
    analysisStale,
    analysisStaleReason: staleness.reason,
    failedJobCount,
    pendingDuplicateGroups,
    pendingAiResults,
  };
}

export function buildNextActions(input: LocalReadiness): NextAction[] {
  const actions: NextAction[] = [];

  if (input.failedJobCount > 0) {
    actions.push({
      id: 'retry-failed-jobs',
      priority: 100,
      kind: 'retry',
      title: 'Retry failed jobs',
      detail: `${input.failedJobCount} failed ${pluralize(input.failedJobCount, 'job')} need attention.`,
      href: '/jobs',
      safeAction: 'retry',
    });
  }

  if (input.lastSyncAt === null) {
    actions.push({
      id: 'sync-library',
      priority: 90,
      kind: 'sync',
      title: 'Sync your library',
      detail: 'No documents have been synced yet.',
      href: '/documents',
      safeAction: 'sync',
    });
  } else if (input.analysisStale) {
    actions.push({
      id: 'run-analysis',
      priority: 80,
      kind: 'analysis',
      title: 'Run duplicate analysis',
      detail: 'Your latest sync has not been fully analysed.',
      href: '/duplicates',
      safeAction: 'analysis',
    });
  }

  if (input.pendingDuplicateGroups > 0) {
    actions.push({
      id: 'review-duplicates',
      priority: 70,
      kind: 'duplicate_review',
      title: 'Review duplicate groups',
      detail: `${input.pendingDuplicateGroups} ${pluralize(input.pendingDuplicateGroups, 'group')} await review.`,
      href: '/duplicates',
    });
  }

  if (input.pendingAiResults > 0) {
    actions.push({
      id: 'review-ai-results',
      priority: 60,
      kind: 'ai_review',
      title: 'Review AI suggestions',
      detail: `${input.pendingAiResults} AI ${pluralize(input.pendingAiResults, 'suggestion')} await review.`,
      href: '/ai-processing/review',
    });
  }

  return actions.sort((left, right) => right.priority - left.priority);
}

function isAnalysisStale(
  lastSyncAt: string | null,
  lastAnalysisAt: string | null,
  now: Date,
): boolean {
  if (lastSyncAt === null) return false;
  if (lastAnalysisAt === null) return true;

  const lastAnalysisTime = Date.parse(lastAnalysisAt);
  const lastSyncTime = Date.parse(lastSyncAt);
  if (Number.isNaN(lastAnalysisTime) || Number.isNaN(lastSyncTime)) return true;

  return (
    lastAnalysisTime < lastSyncTime || now.getTime() - lastAnalysisTime >= ANALYSIS_STALE_AFTER_MS
  );
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
