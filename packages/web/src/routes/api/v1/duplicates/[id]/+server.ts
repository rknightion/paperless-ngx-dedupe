import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDuplicateGroup,
  getDuplicateGroupLight,
  deleteDuplicateGroup,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const light = url.searchParams.get('light') === 'true';
  const group = light
    ? getDuplicateGroupLight(locals.db, params.id)
    : getDuplicateGroup(locals.db, params.id);

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
