import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getConversations, paginationSchema } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  const params = Object.fromEntries(url.searchParams);
  const pagination = paginationSchema.parse({
    limit: params.limit ? Number(params.limit) : undefined,
    offset: params.offset ? Number(params.offset) : undefined,
  });

  const result = getConversations(locals.db, pagination);
  return apiSuccess(result.conversations, { total: result.total });
};
