import {
  getConfig,
  getDedupConfig,
  getDashboard,
  getAiConfig,
  getRagConfig,
  getRagStats,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_TAG_ALIAS_MAP,
} from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const config = getConfig(locals.db);
  const dedupConfig = getDedupConfig(locals.db);
  const dashboard = getDashboard(locals.db);

  const aiConfig = locals.config.AI_ENABLED ? getAiConfig(locals.db) : null;

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
    aiConfig,
    isDefaultPrompt: aiConfig
      ? aiConfig.promptTemplate === DEFAULT_EXTRACTION_PROMPT
      : true,
    isDefaultTagAliasMap: aiConfig
      ? aiConfig.tagAliasMap === DEFAULT_TAG_ALIAS_MAP
      : true,
    hasOpenAiKey: !!locals.config.AI_OPENAI_API_KEY,
    ragEnabled: locals.config.RAG_ENABLED,
    ragConfig: locals.config.RAG_ENABLED ? getRagConfig(locals.db) : null,
    ragStats: locals.config.RAG_ENABLED ? getRagStats(locals.db) : null,
  };
};
