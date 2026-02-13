import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDocument } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const document = getDocument(locals.db, params.id);

  if (!document) {
    return apiError(ErrorCode.NOT_FOUND, `Document not found: ${params.id}`);
  }

  return apiSuccess(document);
};
