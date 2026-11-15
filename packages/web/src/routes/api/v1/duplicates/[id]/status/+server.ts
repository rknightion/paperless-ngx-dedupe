import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  GROUP_STATUS_VALUES,
  OperationConflictError,
  setGroupStatus,
  StatusTransitionError,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const allowedStatuses = GROUP_STATUS_VALUES.filter((status) => status !== 'deleted');
const bodySchema = z.object({ status: z.enum(allowedStatuses) });

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid request body', result.error.issues);
  }
  const { status } = result.data;

  try {
    const updated = withDuplicateMutationLease(locals.db, () =>
      setGroupStatus(locals.db, params.id, status),
    );

    if (!updated) {
      return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
    }

    return apiSuccess({ groupId: params.id, status });
  } catch (error) {
    if (error instanceof StatusTransitionError) {
      return apiError(ErrorCode.CONFLICT, error.message);
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'set_duplicate_status',
        retryable: true,
      });
    }
    throw error;
  }
};
