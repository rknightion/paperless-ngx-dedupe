import {
  assertCompletedDeletionRun,
  DeletionRunNotFoundError,
  JobType,
  OperationConflictError,
} from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../../../runtime.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
  const operation = 'duplicate_restore';
  if (locals.config.PAPERLESS_READ_ONLY) {
    return apiError(ErrorCode.READ_ONLY, { operation, retryable: false });
  }
  try {
    assertCompletedDeletionRun(locals.db, params.planId);
    const runtime = await getServerRuntime();
    const intent = runtime.enqueueManual('duplicate_delete', JobType.DUPLICATE_RESTORE, {
      planId: params.planId,
    });
    await runtime.dispatchPending();
    return apiSuccess({ jobId: intent.jobId }, undefined, 202);
  } catch (error) {
    if (error instanceof DeletionRunNotFoundError) {
      return apiError(ErrorCode.NOT_FOUND, { operation, retryable: false });
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, { operation, retryable: true });
    }
    if (error instanceof RuntimeUnavailableError) {
      return apiError(ErrorCode.SERVICE_UNAVAILABLE, { operation, retryable: true }, 503);
    }
    throw error;
  }
};
