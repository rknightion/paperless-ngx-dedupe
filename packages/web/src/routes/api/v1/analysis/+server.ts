import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { createJob, JobAlreadyRunningError, JobType, launchWorker, getWorkerPath } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  let force = false;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      force = body?.force === true;
    } catch {
      // Ignore parse errors, default to non-force
    }
  }

  let jobId: string;
  try {
    jobId = createJob(locals.db, JobType.ANALYSIS);
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }

  // Launch analysis worker
  const workerPath = getWorkerPath('analysis-worker');
  launchWorker({
    jobId,
    dbPath: locals.config.DATABASE_URL,
    workerScriptPath: workerPath,
    taskData: { force },
  });

  return apiSuccess({ jobId }, undefined, 202);
};
