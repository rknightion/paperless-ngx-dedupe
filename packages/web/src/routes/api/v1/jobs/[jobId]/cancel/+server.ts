import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { cancelJob, getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  const job = getJob(locals.db, params.jobId);

  if (!job) {
    return apiError(ErrorCode.NOT_FOUND, `Job '${params.jobId}' not found`);
  }

  const cancelled = cancelJob(locals.db, params.jobId);

  if (!cancelled) {
    return apiError(ErrorCode.CONFLICT, `Job '${params.jobId}' is already in a terminal state`);
  }

  return apiSuccess({ jobId: params.jobId, status: 'cancelled' });
};
