import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { listJobs } from '@paperless-dedupe/core';
import type { JobType, JobStatus } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const type = (url.searchParams.get('type') ?? undefined) as JobType | undefined;
  const status = (url.searchParams.get('status') ?? undefined) as JobStatus | undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 200)) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'limit must be between 1 and 200');
  }

  const jobs = listJobs(locals.db, {
    type,
    status,
    limit,
  });

  return apiSuccess(jobs);
};
