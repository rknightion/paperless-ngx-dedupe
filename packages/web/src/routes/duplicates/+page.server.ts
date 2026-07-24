import {
  getDuplicateGroups,
  getDuplicateStats,
  listDuplicateInbox,
  paginationSchema,
  duplicateInboxQuerySchema,
  duplicateGroupFiltersSchema,
} from '@paperless-dedupe/core';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const INBOX_QUERY_KEYS = new Set(['queue', 'cursor', 'correspondent']);

export const load: PageServerLoad = async ({ url, locals }) => {
  const usesInboxQuery =
    url.searchParams.size === 0 ||
    [...url.searchParams.keys()].some((key) => INBOX_QUERY_KEYS.has(key));

  if (usesInboxQuery) {
    const queryResult = duplicateInboxQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!queryResult.success) {
      throw error(400, 'Invalid duplicate inbox query');
    }

    const page = listDuplicateInbox(locals.db, queryResult.data);
    const totalByQueue = {
      pending: page.counts.pending,
      'high-confidence': page.counts.highConfidence,
      ambiguous: page.counts.ambiguous,
      ignored: page.counts.ignored,
      deleted: page.counts.deleted,
    };

    return {
      groups: page.items,
      total: totalByQueue[page.query.queue],
      limit: page.query.limit,
      offset: 0,
      paginationMode: 'inbox' as const,
      nextCursor: page.nextCursor,
      queueCounts: page.counts,
      query: page.query,
      filters: page.query,
      paperlessUrl: locals.config.PAPERLESS_URL,
      deletedGroupCount: page.counts.deleted,
    };
  }

  const pagination = paginationSchema.parse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  const filters = duplicateGroupFiltersSchema.parse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    includeDeleted: url.searchParams.get('includeDeleted') ?? undefined,
    sortBy: url.searchParams.get('sortBy') ?? undefined,
    sortOrder: url.searchParams.get('sortOrder') ?? undefined,
  });

  const result = getDuplicateGroups(locals.db, filters, pagination);
  const stats = getDuplicateStats(locals.db);

  return {
    groups: result.items,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    paginationMode: 'legacy' as const,
    filters,
    paperlessUrl: locals.config.PAPERLESS_URL,
    deletedGroupCount: stats.deletedGroups,
  };
};
