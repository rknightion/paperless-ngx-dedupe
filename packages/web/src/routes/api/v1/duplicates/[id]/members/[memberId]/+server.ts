import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { removeMemberFromGroup, PrimaryMemberError } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const removed = removeMemberFromGroup(locals.db, params.id, params.memberId);

    if (!removed) {
      return apiError(ErrorCode.NOT_FOUND, `Member not found in group`);
    }

    return apiSuccess({ removed: true });
  } catch (e) {
    if (e instanceof PrimaryMemberError) {
      return apiError(ErrorCode.CONFLICT, e.message);
    }
    throw e;
  }
};
