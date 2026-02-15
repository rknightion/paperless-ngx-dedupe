import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  createJob,
  JobAlreadyRunningError,
  JobType,
  launchWorker,
  getWorkerPath,
  duplicateGroup,
} from '@paperless-dedupe/core';
import { inArray } from 'drizzle-orm';
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

  // Guard: only allow deletion of groups in 'pending' status
  const groups = locals.db
    .select({ id: duplicateGroup.id, status: duplicateGroup.status })
    .from(duplicateGroup)
    .where(inArray(duplicateGroup.id, result.data.groupIds))
    .all();

  const nonPending = groups.filter((g) => g.status !== 'pending');
  if (nonPending.length > 0) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      `All groups must be in 'pending' status before deletion. Found ${nonPending.length} group(s) with non-pending status.`,
    );
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
