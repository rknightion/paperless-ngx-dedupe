import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  createJob,
  JobAlreadyRunningError,
  JobType,
  launchWorker,
  getWorkerPath,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let reprocess = false;
  let documentIds: string[] | undefined;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      reprocess = body?.reprocess === true;
      if (Array.isArray(body?.documentIds)) {
        documentIds = body.documentIds;
      }
    } catch {
      // Ignore parse errors
    }
  }

  let jobId: string;
  try {
    jobId = createJob(locals.db, JobType.AI_PROCESSING);
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }

  const workerPath = getWorkerPath('ai-processing-worker');
  launchWorker({
    jobId,
    dbPath: locals.config.DATABASE_URL,
    workerScriptPath: workerPath,
    taskData: { reprocess, documentIds },
  });

  return apiSuccess({ jobId }, undefined, 202);
};
