import { getConfig, getDedupConfig, getDashboard } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const config = getConfig(locals.db);
  const dedupConfig = getDedupConfig(locals.db);
  const dashboard = getDashboard(locals.db);

  return {
    config,
    dedupConfig,
    system: {
      databaseUrl: locals.config.DATABASE_URL,
      paperlessUrl: locals.config.PAPERLESS_URL,
      totalDocuments: dashboard.totalDocuments,
      duplicateGroups: dashboard.unresolvedGroups,
    },
  };
};
