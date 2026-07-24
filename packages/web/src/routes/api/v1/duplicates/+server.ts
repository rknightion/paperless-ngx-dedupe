import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDuplicateGroups,
  listDuplicateInbox,
  paginationSchema,
  duplicateInboxQuerySchema,
  duplicateGroupFiltersSchema,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

const INBOX_QUERY_KEYS = new Set(['queue', 'cursor', 'correspondent']);

export const GET: RequestHandler = async ({ url, locals }) => {
  const rawQuery = Object.fromEntries(url.searchParams);
  const usesInboxQuery = [...url.searchParams.keys()].some((key) => INBOX_QUERY_KEYS.has(key));

  if (usesInboxQuery) {
    const queryResult = duplicateInboxQuerySchema.safeParse(rawQuery);
    if (!queryResult.success) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'list_duplicate_inbox',
        retryable: false,
        validationIssues: queryResult.error.issues,
      });
    }

    const page = listDuplicateInbox(locals.db, queryResult.data);
    return apiSuccess(page.items, {
      nextCursor: page.nextCursor,
      counts: page.counts,
      query: page.query,
    });
  }

  const paginationResult = paginationSchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!paginationResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid pagination parameters',
      paginationResult.error.issues,
    );
  }

  const filtersResult = duplicateGroupFiltersSchema.safeParse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    includeDeleted: url.searchParams.get('includeDeleted') ?? undefined,
    sortBy: url.searchParams.get('sortBy') ?? undefined,
    sortOrder: url.searchParams.get('sortOrder') ?? undefined,
  });

  if (!filtersResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid filter parameters',
      filtersResult.error.issues,
    );
  }

  const result = getDuplicateGroups(locals.db, filtersResult.data, paginationResult.data);
  return apiSuccess(result.items, {
    total: result.total,
    totalMemberCount: result.totalMemberCount,
    limit: result.limit,
    offset: result.offset,
  });
};
