import { count, eq, sql } from 'drizzle-orm';
import { type AppDatabase } from '../db/client.js';
import { document } from '../schema/sqlite/documents.js';
import { duplicateGroup } from '../schema/sqlite/duplicates.js';
import { job } from '../schema/sqlite/jobs.js';
import { aiProcessingResult } from '../schema/sqlite/ai-processing.js';
import { syncState } from '../schema/sqlite/app.js';
import { dispatchIntent } from '../schema/sqlite/automation.js';
import { DUPLICATE_HIGH_CONFIDENCE_THRESHOLD } from '../queries/types.js';

/** Read application counts and successful-run times without loading document content. */
export function getGaugeStats(db: AppDatabase): {
  documentsCount: number;
  unresolvedDuplicatesCount: number;
  activeJobsCount: number;
  aiPendingCount: number;
  pendingHighConfidenceCount: number;
  pendingAmbiguousCount: number;
  deadLetterJobsCount: number;
  lastSyncSuccessTimestamp?: number;
  lastAnalysisSuccessTimestamp?: number;
} {
  const pending = db
    .select({
      total: count(),
      high: sql<number>`COALESCE(SUM(CASE WHEN ${duplicateGroup.confidenceScore} >= ${DUPLICATE_HIGH_CONFIDENCE_THRESHOLD} THEN 1 ELSE 0 END), 0)`,
    })
    .from(duplicateGroup)
    .where(eq(duplicateGroup.status, 'pending'))
    .get()!;
  const jobs = db
    .select({
      active: count(),
      deadLetter: sql<number>`(SELECT COUNT(*) FROM ${dispatchIntent} WHERE ${dispatchIntent.status} = 'dead_letter')`,
    })
    .from(job)
    .where(eq(job.status, 'running'))
    .get()!;
  const state = db
    .select({ lastSyncAt: syncState.lastSyncAt, lastAnalysisAt: syncState.lastAnalysisAt })
    .from(syncState)
    .where(eq(syncState.id, 'singleton'))
    .get();
  return {
    documentsCount: db.select({ value: count() }).from(document).get()!.value,
    unresolvedDuplicatesCount: pending.total,
    pendingHighConfidenceCount: pending.high,
    pendingAmbiguousCount: pending.total - pending.high,
    activeJobsCount: jobs.active,
    deadLetterJobsCount: jobs.deadLetter,
    lastSyncSuccessTimestamp: state?.lastSyncAt ? Date.parse(state.lastSyncAt) / 1000 : undefined,
    lastAnalysisSuccessTimestamp: state?.lastAnalysisAt
      ? Date.parse(state.lastAnalysisAt) / 1000
      : undefined,
    aiPendingCount: db
      .select({ value: count() })
      .from(aiProcessingResult)
      .where(eq(aiProcessingResult.appliedStatus, 'pending_review'))
      .get()!.value,
  };
}
