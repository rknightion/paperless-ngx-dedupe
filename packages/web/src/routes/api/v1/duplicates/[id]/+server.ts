import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDuplicateGroup,
  getDuplicateGroupLight,
  deleteDuplicateGroup,
  OperationConflictError,
  withDuplicateMutationLease,
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
  let deleted: boolean;
  try {
    deleted = withDuplicateMutationLease(locals.db, () =>
      deleteDuplicateGroup(locals.db, params.id),
    );
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'delete_duplicate_group',
        retryable: true,
      });
    }
    throw error;
  }

  if (!deleted) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ deleted: true });
};
