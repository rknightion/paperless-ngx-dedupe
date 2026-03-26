import { getDocumentStats } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const stats = getDocumentStats(locals.db);
  const paperlessUrl = locals.config.PAPERLESS_URL;
  const aiEnabled = locals.config.AI_ENABLED;

  return { stats, paperlessUrl, aiEnabled };
};
