import { z } from 'zod';
import {
  createPairDecision,
  listPairDecisionsWithDocuments,
} from '@paperless-dedupe/core/queries/duplicates';
import { OperationConflictError, withDuplicateMutationLease } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  cursor: z.string().min(1).max(200).optional(),
});
const paperlessId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const bodySchema = z.object({
  paperlessIds: z
    .tuple([paperlessId, paperlessId])
    .refine(([a, b]) => a !== b, 'Choose two distinct IDs'),
});

export const GET: RequestHandler = async ({ locals, url }) => {
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success)
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'list_pair_decisions',
      validationIssues: query.error.issues,
    });
  try {
    const { items, nextCursor, total } = listPairDecisionsWithDocuments(locals.db, query.data);
    return apiSuccess(items, { nextCursor, total });
  } catch (error) {
    if (error instanceof RangeError)
      return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'list_pair_decisions' });
    throw error;
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'create_pair_decision' });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'create_pair_decision',
      validationIssues: parsed.error.issues,
    });
  try {
    const id = withDuplicateMutationLease(locals.db, () =>
      createPairDecision(locals.db, parsed.data.paperlessIds),
    );
    return apiSuccess({ id }, undefined, 201);
  } catch (error) {
    if (error instanceof OperationConflictError)
      return apiError(ErrorCode.CONFLICT, { operation: 'create_pair_decision', retryable: true });
    throw error;
  }
};
