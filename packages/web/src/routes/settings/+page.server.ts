import { getConfig, getDedupConfig, getDashboard, getAiConfig } from '@paperless-dedupe/core';
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
      duplicateGroups: dashboard.pendingGroups,
    },
    aiEnabled: locals.config.AI_ENABLED,
    aiConfig: locals.config.AI_ENABLED ? getAiConfig(locals.db) : null,
    hasOpenAiKey: !!locals.config.AI_OPENAI_API_KEY,
    hasAnthropicKey: !!locals.config.AI_ANTHROPIC_API_KEY,
  };
};
