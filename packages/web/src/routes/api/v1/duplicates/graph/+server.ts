import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getSimilarityGraph, similarityGraphFiltersSchema } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const filtersResult = similarityGraphFiltersSchema.safeParse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    maxGroups: url.searchParams.get('maxGroups') ?? undefined,
  });

  if (!filtersResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid filter parameters',
      filtersResult.error.issues,
    );
  }

  const result = getSimilarityGraph(locals.db, filtersResult.data);
  return apiSuccess(result);
};
