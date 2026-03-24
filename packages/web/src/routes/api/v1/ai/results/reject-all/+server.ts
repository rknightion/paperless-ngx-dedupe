import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { batchRejectAiResults, getPendingAiResultIds } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const resultIds = getPendingAiResultIds(locals.db);

  if (resultIds.length === 0) {
    return apiSuccess({ rejected: 0 });
  }

  batchRejectAiResults(locals.db, resultIds);
  return apiSuccess({ rejected: resultIds.length });
};
