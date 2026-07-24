import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getAiInboxResult, getAiResult } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const result =
    url.searchParams.get('mode') === 'inbox'
      ? getAiInboxResult(locals.db, params.id)
      : getAiResult(locals.db, params.id);
  if (!result) {
    return apiError(ErrorCode.NOT_FOUND, 'AI result not found');
  }
  return apiSuccess(result);
};
