import { apiSuccess } from '$lib/server/api';
import { listJobs, JobType, JobStatus, syncState } from '@paperless-dedupe/core';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { db } = locals;

  // Read sync state
  const state = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();

  // Check for running sync job
  const runningJobs = listJobs(db, { type: JobType.SYNC, status: JobStatus.RUNNING, limit: 1 });
  const pendingJobs = listJobs(db, { type: JobType.SYNC, status: JobStatus.PENDING, limit: 1 });
  const activeJob = runningJobs[0] ?? pendingJobs[0] ?? null;

  return apiSuccess({
    lastSyncAt: state?.lastSyncAt ?? null,
    lastSyncDocumentCount: state?.lastSyncDocumentCount ?? null,
    totalDocuments: state?.totalDocuments ?? 0,
    isSyncing: activeJob !== null,
    currentJobId: activeJob?.id ?? null,
  });
};
