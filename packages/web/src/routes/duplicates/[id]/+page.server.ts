import { error } from '@sveltejs/kit';
import { getDuplicateGroupLight, getDedupConfig } from '@paperless-dedupe/core';
import { createPaperlessMediaUrl } from '$lib/server/paperless-auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const group = getDuplicateGroupLight(locals.db, params.id);
  if (!group) {
    throw error(404, 'Duplicate group not found');
  }

  const dedupConfig = getDedupConfig(locals.db);
  const mediaByDocumentId = Object.fromEntries(
    group.members.map((member) => [
      member.documentId,
      {
        thumbnailUrl: createPaperlessMediaUrl(locals.config, member.paperlessId, 'thumb'),
        previewUrl: createPaperlessMediaUrl(locals.config, member.paperlessId, 'preview'),
      },
    ]),
  );

  return {
    group,
    mediaByDocumentId,
    paperlessUrl: locals.config.PAPERLESS_URL,
    weights: {
      jaccard: dedupConfig.confidenceWeightJaccard,
      fuzzy: dedupConfig.confidenceWeightFuzzy,
      penaltyStrength: dedupConfig.discriminativePenaltyStrength,
    },
  };
};
