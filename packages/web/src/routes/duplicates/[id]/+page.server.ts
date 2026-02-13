import { error } from '@sveltejs/kit';
import { getDuplicateGroupLight, getDedupConfig } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const group = getDuplicateGroupLight(locals.db, params.id);
  if (!group) {
    throw error(404, 'Duplicate group not found');
  }

  const dedupConfig = getDedupConfig(locals.db);

  return {
    group,
    paperlessUrl: locals.config.PAPERLESS_URL,
    weights: {
      jaccard: dedupConfig.confidenceWeightJaccard,
      fuzzy: dedupConfig.confidenceWeightFuzzy,
      metadata: dedupConfig.confidenceWeightMetadata,
      filename: dedupConfig.confidenceWeightFilename,
    },
  };
};
