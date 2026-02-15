import { getSimilarityGraph, similarityGraphFiltersSchema } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const filters = similarityGraphFiltersSchema.parse({
    minConfidence: url.searchParams.get('minConfidence') ?? undefined,
    maxConfidence: url.searchParams.get('maxConfidence') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    maxGroups: url.searchParams.get('maxGroups') ?? undefined,
  });

  const graph = getSimilarityGraph(locals.db, filters);

  return { graph, filters };
};
