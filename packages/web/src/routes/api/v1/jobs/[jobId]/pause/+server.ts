import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { pauseJob, getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  const job = getJob(locals.db, params.jobId);

  if (!job) {
    return apiError(ErrorCode.NOT_FOUND, `Job '${params.jobId}' not found`);
  }

  const paused = pauseJob(locals.db, params.jobId);

  if (!paused) {
    return apiError(
      ErrorCode.CONFLICT,
      `Job '${params.jobId}' cannot be paused (status: ${job.status})`,
    );
  }

  return apiSuccess({ jobId: params.jobId, status: 'paused' });
};
