import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { markGroupResolved } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, locals }) => {
  const updated = markGroupResolved(locals.db, params.id);

  if (!updated) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ groupId: params.id, resolved: true });
};
