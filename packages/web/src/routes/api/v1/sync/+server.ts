import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { JobType, OperationConflictError } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
import { getServerRuntime } from '../../../../runtime.server';
import { RuntimeUnavailableError } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
  let force = false;
  let purge = false;

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      force = body?.force === true;
      purge = body?.purge === true;
    } catch {
      // Ignore parse errors, default to non-force
    }
  }

  const runtime = await getServerRuntime();
  try {
    const intent = runtime.enqueueManual('sync', JobType.SYNC, { force, purge });
    await runtime.dispatchPending();
    return apiSuccess({ jobId: intent.jobId }, undefined, 202);
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'manual_sync', retryable: true },
        503,
      );
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }
};
