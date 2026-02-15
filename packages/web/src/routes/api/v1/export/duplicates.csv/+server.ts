import { apiError, ErrorCode } from '$lib/server/api';
import {
  duplicateGroupFiltersSchema,
  getDuplicateGroupsForExport,
  formatDuplicatesCsv,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const filtersResult = duplicateGroupFiltersSchema.safeParse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
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

  const rows = getDuplicateGroupsForExport(locals.db, filtersResult.data);
  const csv = formatDuplicatesCsv(rows);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="duplicates-${date}.csv"`,
    },
  });
};
