import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getRagStats } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }
  const stats = getRagStats(locals.db);
  return apiSuccess(stats);
};
