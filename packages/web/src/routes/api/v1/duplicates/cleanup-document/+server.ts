import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  OperationConflictError,
  removeDocumentFromAllGroups,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.documentId !== 'string' || !body.documentId) {
    return apiError(ErrorCode.BAD_REQUEST, 'documentId is required');
  }

  try {
    const result = withDuplicateMutationLease(locals.db, () =>
      removeDocumentFromAllGroups(locals.db, body.documentId),
    );
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'cleanup_duplicate_document',
        retryable: true,
      });
    }
    throw error;
  }
};
