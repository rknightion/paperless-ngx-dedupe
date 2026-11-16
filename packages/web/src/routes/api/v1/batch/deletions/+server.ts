import { z } from 'zod';
import { listCompletedDeletionRuns } from '@paperless-dedupe/core';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(url.searchParams.get('limit') ?? 20);
  if (!limit.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, { operation: 'list_deletions' });
  }
  return apiSuccess(listCompletedDeletionRuns(locals.db, limit.data));
};
