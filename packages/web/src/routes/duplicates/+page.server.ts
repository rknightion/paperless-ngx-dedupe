import {
  getDuplicateGroups,
  paginationSchema,
  duplicateGroupFiltersSchema,
} from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const pagination = paginationSchema.parse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  const filters = duplicateGroupFiltersSchema.parse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    sortBy: url.searchParams.get('sortBy') ?? undefined,
    sortOrder: url.searchParams.get('sortOrder') ?? undefined,
  });

  const result = getDuplicateGroups(locals.db, filters, pagination);

  return {
    groups: result.items,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    filters,
    paperlessUrl: locals.config.PAPERLESS_URL,
  };
};
