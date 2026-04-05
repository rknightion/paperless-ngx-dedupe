import { apiSuccess } from '$lib/server/api';
import { listJobs, JobType, JobStatus, syncState } from '@paperless-dedupe/core';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { db } = locals;

  // Read sync state
  const state = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();

  // Check for running/pending/paused analysis job
  const runningJobs = listJobs(db, { type: JobType.ANALYSIS, status: JobStatus.RUNNING, limit: 1 });
  const pendingJobs = listJobs(db, { type: JobType.ANALYSIS, status: JobStatus.PENDING, limit: 1 });
  const pausedJobs = listJobs(db, { type: JobType.ANALYSIS, status: JobStatus.PAUSED, limit: 1 });
  const activeJob = runningJobs[0] ?? pendingJobs[0] ?? pausedJobs[0] ?? null;

  return apiSuccess({
    lastAnalysisAt: state?.lastAnalysisAt ?? null,
    totalDuplicateGroups: state?.totalDuplicateGroups ?? 0,
    isAnalyzing: activeJob !== null,
    isPaused: activeJob?.status === 'paused',
    currentJobId: activeJob?.id ?? null,
  });
};
