import {
  deletePairDecision,
  OperationConflictError,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  try {
    const deleted = withDuplicateMutationLease(locals.db, () =>
      deletePairDecision(locals.db, params.id),
    );
    return deleted
      ? apiSuccess({ deleted: true })
      : apiError(ErrorCode.NOT_FOUND, { operation: 'delete_pair_decision' });
  } catch (error) {
    if (error instanceof OperationConflictError)
      return apiError(ErrorCode.CONFLICT, { operation: 'delete_pair_decision', retryable: true });
    throw error;
  }
};
