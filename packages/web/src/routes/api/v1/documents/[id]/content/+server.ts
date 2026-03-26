import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDocumentContent } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const content = getDocumentContent(locals.db, params.id);
  if (!content) {
    return apiError(ErrorCode.NOT_FOUND, 'Document content not found');
  }
  return apiSuccess(content);
};
