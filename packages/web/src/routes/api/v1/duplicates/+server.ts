import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDuplicateGroups, paginationSchema, duplicateGroupFiltersSchema } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const paginationResult = paginationSchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!paginationResult.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid pagination parameters', paginationResult.error.issues);
  }

  const filtersResult = duplicateGroupFiltersSchema.safeParse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    reviewed: url.searchParams.get('reviewed') ?? undefined,
    resolved: url.searchParams.get('resolved') ?? undefined,
    sortBy: url.searchParams.get('sortBy') ?? undefined,
    sortOrder: url.searchParams.get('sortOrder') ?? undefined,
  });

  if (!filtersResult.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid filter parameters', filtersResult.error.issues);
  }

  const result = getDuplicateGroups(locals.db, filtersResult.data, paginationResult.data);
  return apiSuccess(result.items, { total: result.total, limit: result.limit, offset: result.offset });
};
