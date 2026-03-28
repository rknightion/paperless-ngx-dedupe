import {
  getAiResults,
  getUnprocessedDocuments,
  getUnprocessedDocumentFacets,
  getAiConfig,
} from '@paperless-dedupe/core';
import type { UnprocessedDocumentFilters } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

const validSorts = new Set(['newest', 'oldest', 'title_asc', 'title_desc', 'random']);

export const load: PageServerLoad = async ({ locals, url }) => {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const sortParam = url.searchParams.get('sort') ?? undefined;
  const filters: UnprocessedDocumentFilters = {
    search: url.searchParams.get('search') || undefined,
    correspondent: url.searchParams.get('correspondent') || undefined,
    documentType: url.searchParams.get('documentType') || undefined,
    tag: url.searchParams.get('tag') || undefined,
    sort:
      sortParam && validSorts.has(sortParam)
        ? (sortParam as UnprocessedDocumentFilters['sort'])
        : undefined,
    seed: url.searchParams.has('seed')
      ? parseInt(url.searchParams.get('seed')!, 10) || undefined
      : undefined,
  };

  const unprocessed = getUnprocessedDocuments(locals.db, limit, offset, filters);
  const failed = getAiResults(locals.db, { status: 'failed' }, 50, 0);
  const aiConfig = getAiConfig(locals.db);
  const facets = getUnprocessedDocumentFacets(locals.db);

  return { unprocessed, failed, reasoningEffort: aiConfig.reasoningEffort, facets, filters };
};
