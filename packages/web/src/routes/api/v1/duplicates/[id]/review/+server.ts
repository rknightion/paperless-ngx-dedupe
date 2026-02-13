import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { markGroupReviewed } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, locals }) => {
  const updated = markGroupReviewed(locals.db, params.id);

  if (!updated) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ groupId: params.id, reviewed: true });
};
