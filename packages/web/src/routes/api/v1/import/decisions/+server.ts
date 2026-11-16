import { ZodError } from 'zod';
import { importDecisions } from '@paperless-dedupe/core/export/decisions';
import { OperationConflictError, withDuplicateMutationLease } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, url }) => {
  const dryRun = url.searchParams.get('dryRun');
  if (dryRun !== null && dryRun !== 'true' && dryRun !== 'false')
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'import_decisions' });
  let data: unknown;
  try {
    // The adapter enforces the same BODY_SIZE_LIMIT as config import.
    data = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'import_decisions' });
  }
  try {
    return apiSuccess(
      withDuplicateMutationLease(locals.db, () =>
        importDecisions(locals.db, data, { dryRun: dryRun === 'true' }),
      ),
    );
  } catch (error) {
    if (error instanceof ZodError)
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'import_decisions',
        validationIssues: error.issues,
      });
    if (error instanceof OperationConflictError)
      return apiError(ErrorCode.CONFLICT, { operation: 'import_decisions', retryable: true });
    throw error;
  }
};
