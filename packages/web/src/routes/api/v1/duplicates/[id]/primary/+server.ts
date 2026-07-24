import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  OperationConflictError,
  setPrimaryDocument,
  withDuplicateMutationLease,
} from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  documentId: z.string().min(1),
});

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

  let updated: boolean;
  try {
    updated = withDuplicateMutationLease(locals.db, () =>
      setPrimaryDocument(locals.db, params.id, result.data.documentId),
    );
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'set_duplicate_primary',
        retryable: true,
      });
    }
    throw error;
  }

  if (!updated) {
    return apiError(ErrorCode.NOT_FOUND, `Duplicate group not found: ${params.id}`);
  }

  return apiSuccess({ groupId: params.id, documentId: result.data.documentId });
};
