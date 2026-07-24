import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  OperationConflictError,
  PrimaryMemberError,
  removeMemberFromGroup,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const removed = withDuplicateMutationLease(locals.db, () =>
      removeMemberFromGroup(locals.db, params.id, params.memberId),
    );

    if (!removed) {
      return apiError(ErrorCode.NOT_FOUND, `Member not found in group`);
    }

    return apiSuccess({ removed: true });
  } catch (e) {
    if (e instanceof PrimaryMemberError) {
      return apiError(ErrorCode.CONFLICT, e.message);
    }
    if (e instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'remove_duplicate_member',
        retryable: true,
      });
    }
    throw e;
  }
};
