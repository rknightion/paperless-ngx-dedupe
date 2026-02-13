import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { createJob, JobAlreadyRunningError, JobType, launchWorker, getWorkerPath } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1).max(1000),
  confirm: z.literal(true),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid request body', result.error.issues);
  }

  let jobId: string;
  try {
    jobId = createJob(locals.db, JobType.BATCH_OPERATION);
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }

  const workerPath = getWorkerPath('batch-worker');
  launchWorker({
    jobId,
    dbPath: locals.config.DATABASE_URL,
    workerScriptPath: workerPath,
    taskData: { groupIds: result.data.groupIds },
  });

  return apiSuccess({ jobId }, undefined, 202);
};
