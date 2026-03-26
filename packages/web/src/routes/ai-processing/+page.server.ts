import { getAiStats, getAiResults, getAiConfig, listJobs, JobType } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.config.AI_ENABLED) {
    redirect(302, '/');
  }

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
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const stats = getAiStats(locals.db);
  const results = getAiResults(
    locals.db,
    { status, search, sort, changedOnly, failed, minConfidence, maxConfidence, provider, model },
    limit,
    offset,
  );
  const aiConfig = getAiConfig(locals.db);
  const jobs = listJobs(locals.db, { type: JobType.AI_PROCESSING, limit: 1 });

  return {
    stats,
    results: results.items,
    total: results.total,
    limit,
    offset,
    status,
    search,
    sort,
    changedOnly,
    failed,
    minConfidence,
    maxConfidence,
    provider: provider ?? null,
    model: model ?? null,
    aiConfig,
    activeJob: jobs.find((j) => j.status === 'running' || j.status === 'pending') ?? null,
  };
};
