import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { resumeJob, getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  const job = getJob(locals.db, params.jobId);

  if (!job) {
    return apiError(ErrorCode.NOT_FOUND, `Job '${params.jobId}' not found`);
  }

  const resumed = resumeJob(locals.db, params.jobId);

  if (!resumed) {
    return apiError(
      ErrorCode.CONFLICT,
      `Job '${params.jobId}' cannot be resumed (status: ${job.status})`,
    );
  }

  return apiSuccess({ jobId: params.jobId, status: 'running' });
};
