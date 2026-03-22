import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getAiResult } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const result = getAiResult(locals.db, params.id);
  if (!result) {
    return apiError(ErrorCode.NOT_FOUND, 'AI result not found');
  }
  return apiSuccess(result);
};
