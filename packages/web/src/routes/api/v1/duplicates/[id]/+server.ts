import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDuplicateGroup, deleteDuplicateGroup } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const group = getDuplicateGroup(locals.db, params.id);

  if (!group) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess(group);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const deleted = deleteDuplicateGroup(locals.db, params.id);

  if (!deleted) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ deleted: true });
};
