import {
  applyPrimarySelection,
  PrimarySelectionConflictError,
} from '@paperless-dedupe/core/queries/duplicates';
import { OperationConflictError, withDuplicateMutationLease } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { primarySelectionSchema } from '../schema';
import type { RequestHandler } from './$types';
import { z } from 'zod';
const schema = primarySelectionSchema.extend({
  expectedChanging: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'apply_primary' });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'apply_primary',
      validationIssues: parsed.error.issues,
    });
  try {
    return apiSuccess(
      withDuplicateMutationLease(locals.db, () => applyPrimarySelection(locals.db, parsed.data)),
    );
  } catch (error) {
    if (error instanceof OperationConflictError || error instanceof PrimarySelectionConflictError)
      return apiError(ErrorCode.CONFLICT, { operation: 'apply_primary', retryable: true });
    throw error;
  }
};
