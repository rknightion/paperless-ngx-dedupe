import {
  getConfig,
  getDedupConfig,
  getDashboard,
  getAiConfig,
  getRagConfig,
  getRagStats,
  DEFAULT_EXTRACTION_PROMPT,
} from '@paperless-dedupe/core';
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
    isDefaultPrompt: locals.config.AI_ENABLED
      ? getAiConfig(locals.db).promptTemplate === DEFAULT_EXTRACTION_PROMPT
      : true,
    hasOpenAiKey: !!locals.config.AI_OPENAI_API_KEY,
    ragEnabled: locals.config.RAG_ENABLED,
    ragConfig: locals.config.RAG_ENABLED ? getRagConfig(locals.db) : null,
    ragStats: locals.config.RAG_ENABLED ? getRagStats(locals.db) : null,
  };
};
