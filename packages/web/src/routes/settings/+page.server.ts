import {
  getDedupConfig,
  getDashboard,
  getAiConfig,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_TAG_ALIAS_MAP,
  getAutomationSettings,
  getMaintenanceReport,
} from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const dedupConfig = getDedupConfig(locals.db);
  const dashboard = getDashboard(locals.db);

  const aiConfig = locals.config.AI_ENABLED ? getAiConfig(locals.db) : null;

  return {
    dedupConfig,
    connection: {
      url: locals.config.PAPERLESS_URL,
      apiToken: { configured: Boolean(locals.config.PAPERLESS_API_TOKEN) },
      username: { configured: Boolean(locals.config.PAPERLESS_USERNAME) },
      password: { configured: Boolean(locals.config.PAPERLESS_PASSWORD) },
    },
    system: {
      totalDocuments: dashboard.totalDocuments,
      duplicateGroups: dashboard.pendingGroups,
    },
    aiEnabled: locals.config.AI_ENABLED,
    aiConfig,
    isDefaultPrompt: aiConfig ? aiConfig.promptTemplate === DEFAULT_EXTRACTION_PROMPT : true,
    isDefaultTagAliasMap: aiConfig ? aiConfig.tagAliasMap === DEFAULT_TAG_ALIAS_MAP : true,
    hasOpenAiKey: !!locals.config.AI_OPENAI_API_KEY,
    automation: getAutomationSettings(locals.sqlite),
    maintenance: getMaintenanceReport(locals.sqlite),
  };
};
