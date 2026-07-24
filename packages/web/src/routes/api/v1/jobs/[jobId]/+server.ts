import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

function withoutInternalHistoryKey(value: object): Record<string, unknown> {
  const result = { ...value } as Record<string, unknown>;
  delete result.publicHistoryKey;
  return result;
}

export const GET: RequestHandler = async ({ params, locals }) => {
  const job = getJob(locals.db, params.jobId);

  if (!job) {
    return apiError(ErrorCode.NOT_FOUND, `Job '${params.jobId}' not found`);
  }

  return apiSuccess(withoutInternalHistoryKey(job));
};
