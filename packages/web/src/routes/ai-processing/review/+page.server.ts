import { getAiResults, getAiResultGroups } from '@paperless-dedupe/core';
import type { GroupByField } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const sort =
    (url.searchParams.get('sort') as
      | 'newest'
      | 'oldest'
      | 'confidence_asc'
      | 'confidence_desc'
      | null) || undefined;
  const changedOnly = url.searchParams.get('changedOnly') === 'true' || undefined;
  const failed = url.searchParams.get('failed') === 'true' || undefined;
  const minConfidence = url.searchParams.has('minConfidence')
    ? parseFloat(url.searchParams.get('minConfidence')!)
    : undefined;
  const maxConfidence = url.searchParams.has('maxConfidence')
    ? parseFloat(url.searchParams.get('maxConfidence')!)
    : undefined;
  const provider = url.searchParams.get('provider') || undefined;
  const model = url.searchParams.get('model') || undefined;
  const groupByParam = url.searchParams.get('groupBy') || undefined;
  const validGroupByFields: GroupByField[] = [
    'suggestedCorrespondent',
    'suggestedDocumentType',
    'confidenceBand',
    'failureType',
  ];
  const groupBy = validGroupByFields.includes(groupByParam as GroupByField)
    ? (groupByParam as GroupByField)
    : undefined;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const results = getAiResults(
    locals.db,
    { status, search, sort, changedOnly, failed, minConfidence, maxConfidence, provider, model },
    limit,
    offset,
  );
  const filters = {
    status,
    search,
    sort,
    changedOnly,
    failed,
    minConfidence,
    maxConfidence,
    provider,
    model,
  };
  const groups = groupBy ? getAiResultGroups(locals.db, groupBy, filters) : null;

  return {
    results: results.items,
    total: results.total,
    limit,
    offset,
    status,
    search,
    sort,
    groupBy: groupBy ?? null,
    changedOnly,
    failed,
    minConfidence,
    maxConfidence,
    provider: provider ?? null,
    model: model ?? null,
    groups,
  };
};
