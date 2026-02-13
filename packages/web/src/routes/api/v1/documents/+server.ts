import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDocuments, paginationSchema, documentFiltersSchema } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const paginationResult = paginationSchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!paginationResult.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid pagination parameters', paginationResult.error.issues);
  }

  const filtersResult = documentFiltersSchema.safeParse({
    correspondent: url.searchParams.get('correspondent') ?? undefined,
    documentType: url.searchParams.get('documentType') ?? undefined,
    tag: url.searchParams.get('tag') ?? undefined,
    processingStatus: url.searchParams.get('processingStatus') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
  });

  if (!filtersResult.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid filter parameters', filtersResult.error.issues);
  }

  const result = getDocuments(locals.db, filtersResult.data, paginationResult.data);
  return apiSuccess(result.items, { total: result.total, limit: result.limit, offset: result.offset });
};
