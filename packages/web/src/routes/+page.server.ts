import {
  getAiStats,
  getDashboard,
  getDuplicateStats,
  listJobs,
  PaperlessClient,
  toPaperlessConfig,
  type PaperlessReadiness,
  getAutomationSettings,
} from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const dashboard = getDashboard(locals.db);
  const jobs = listJobs(locals.db, { limit: 5 });
  const duplicateStats = getDuplicateStats(locals.db);
  const aiStats = locals.config.AI_ENABLED ? getAiStats(locals.db) : null;
  const paperless = await getPaperlessReadiness(locals.config);

  return {
    dashboard,
    readiness: { ...dashboard.readiness, paperless },
    jobs,
    duplicateStats,
    aiStats,
    automation: getAutomationSettings(locals.sqlite),
  };
};

async function getPaperlessReadiness(
  config: Parameters<typeof toPaperlessConfig>[0],
): Promise<PaperlessReadiness> {
  try {
    const client = new PaperlessClient({
      ...toPaperlessConfig(config),
      timeout: 5_000,
      maxRetries: 0,
    });
    await client.getStatistics();
    return { status: 'connected', apiVersion: client.apiVersion };
  } catch {
    return { status: 'unavailable', apiVersion: null };
  }
}
