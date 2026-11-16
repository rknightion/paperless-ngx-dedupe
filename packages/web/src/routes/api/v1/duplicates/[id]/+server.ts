import { z } from 'zod';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDuplicateGroup,
  getNextDuplicateGroupId,
  duplicateInboxQuerySchema,
  getDuplicateGroupLight,
  deleteDuplicateGroup,
  OperationConflictError,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const filters = url.searchParams.has('queue')
    ? z
        .object({
          queue: duplicateInboxQuerySchema.shape.queue,
          correspondent: duplicateInboxQuerySchema.shape.correspondent,
        })
        .safeParse({
          queue: url.searchParams.get('queue'),
          correspondent: url.searchParams.get('correspondent') ?? undefined,
        })
    : null;
  if (filters && !filters.success)
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'get_duplicate_group' });
  const light = url.searchParams.get('light') === 'true';
  const group = light
    ? getDuplicateGroupLight(locals.db, params.id)
    : getDuplicateGroup(locals.db, params.id);

  if (!group) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess(
    group,
    filters?.success
      ? {
          nextGroupId: getNextDuplicateGroupId(locals.db, {
            ...filters.data,
            afterGroupId: params.id,
          }),
        }
      : undefined,
  );
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
