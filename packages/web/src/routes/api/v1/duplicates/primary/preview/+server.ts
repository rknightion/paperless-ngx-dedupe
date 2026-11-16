import {
  previewPrimarySelection,
  PrimarySelectionConflictError,
} from '@paperless-dedupe/core/queries/duplicates';
import { OperationConflictError, withDuplicateMutationLease } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { primarySelectionSchema } from '../schema';
import type { RequestHandler } from './$types';
const schema = primarySelectionSchema;

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'preview_primary' });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'preview_primary',
      validationIssues: parsed.error.issues,
    });
  try {
    return apiSuccess(
      withDuplicateMutationLease(locals.db, () => previewPrimarySelection(locals.db, parsed.data)),
    );
  } catch (error) {
    if (error instanceof OperationConflictError || error instanceof PrimarySelectionConflictError)
      return apiError(ErrorCode.CONFLICT, { operation: 'preview_primary', retryable: true });
    throw error;
  }
};
