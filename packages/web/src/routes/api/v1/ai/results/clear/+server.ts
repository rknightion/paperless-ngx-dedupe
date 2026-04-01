import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { clearAllAiResults } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const deleted = clearAllAiResults(locals.db);
  return apiSuccess({ deleted });
};
