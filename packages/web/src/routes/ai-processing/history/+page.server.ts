import { getAiResults } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const sort =
    (url.searchParams.get('sort') as
      | 'applied_newest'
      | 'applied_oldest'
      | 'newest'
      | 'oldest'
      | null) || 'applied_newest';
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  // History shows applied, partial, rejected, and reverted statuses
  const historyStatuses = ['applied', 'partial', 'rejected', 'reverted', 'failed'];
  const activeStatus = status && historyStatuses.includes(status) ? status : undefined;

  const results = getAiResults(locals.db, { status: activeStatus, search, sort }, limit, offset);

  return {
    results: results.items,
    total: results.total,
    limit,
    offset,
    status: activeStatus ?? null,
    search: search ?? null,
    sort,
  };
};
