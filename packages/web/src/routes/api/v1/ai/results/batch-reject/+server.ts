import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { batchRejectAiResults } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const resultIds: string[] = body?.resultIds ?? [];

  if (resultIds.length === 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'No result IDs provided');
  }

  batchRejectAiResults(locals.db, resultIds);
  return apiSuccess({ rejected: resultIds.length });
};
