import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { dismissDeadLetterJob, getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!getJob(locals.db, params.jobId)) {
    return apiError(ErrorCode.NOT_FOUND, { operation: 'job_dismiss', retryable: false });
  }
  if (!dismissDeadLetterJob(locals.db, params.jobId)) {
    return apiError(ErrorCode.CONFLICT, { operation: 'job_dismiss', retryable: false });
  }
  return apiSuccess({ jobId: params.jobId, dismissed: true });
};
