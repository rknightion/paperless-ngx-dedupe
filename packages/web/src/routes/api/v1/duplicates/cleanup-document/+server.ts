import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { removeDocumentFromAllGroups } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.documentId !== 'string' || !body.documentId) {
    return apiError(ErrorCode.BAD_REQUEST, 'documentId is required');
  }

  const result = removeDocumentFromAllGroups(locals.db, body.documentId);
  return apiSuccess(result);
};
