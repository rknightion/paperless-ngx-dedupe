import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  createDuplicateDeletionPlan,
  createJob,
  DuplicateDeletionPreviewError,
  getReviewedMutationPlan,
  JobAlreadyRunningError,
  JobType,
  launchWorker,
  MutationPlanError,
} from '@paperless-dedupe/core';
import { resolveServerWorkerPath } from '$lib/server/job-dispatcher';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../runtime.server';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const groupIdsSchema = z.array(z.string().min(1)).min(1).max(50000);

const reviewedPlanBodySchema = z.object({
  planToken: z.string().min(32).max(256),
  confirm: z.literal(true),
});

const legacyBodySchema = z.object({
  groupIds: groupIdsSchema,
  confirm: z.literal(true),
});

const bodySchema = z.union([reviewedPlanBodySchema, legacyBodySchema]);

export const POST: RequestHandler = async ({ request, locals }) => {
  const runtime = await getServerRuntime();
  try {
    runtime.acceptingGate.assertAccepting();

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

    return runtime.acceptingGate.run(() => {
      let planToken: string;
      if ('groupIds' in result.data) {
        planToken = createDuplicateDeletionPlan(locals.db, result.data.groupIds).token;
      } else {
        planToken = result.data.planToken;
        getReviewedMutationPlan(locals.db, planToken, 'duplicate_delete');
      }

      const taskData = { planToken };
      const jobId = createJob(locals.db, JobType.BATCH_OPERATION, taskData);
      const workerPath = resolveServerWorkerPath('batch-worker');
      launchWorker({
        jobId,
        dbPath: locals.config.DATABASE_URL,
        workerScriptPath: workerPath,
        taskData,
      });
      return apiSuccess({ jobId }, undefined, 202);
    });
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'batch_delete_non_primary', retryable: true },
        503,
      );
    }
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    if (error instanceof MutationPlanError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'batch_delete_non_primary',
        retryable: false,
      });
    }
    if (error instanceof DuplicateDeletionPreviewError) {
      return apiError(ErrorCode.VALIDATION_FAILED);
    }
    throw error;
  }
};
