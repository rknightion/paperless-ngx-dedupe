import { getAiStats, getAiConfig, listJobs, JobType } from '@paperless-dedupe/core';
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    redirect(302, '/');
  }

  const stats = getAiStats(locals.db);
  const aiConfig = getAiConfig(locals.db);
  const jobs = listJobs(locals.db, { type: JobType.AI_PROCESSING, limit: 1 });

  return {
    stats,
    aiConfig,
    activeJob: jobs.find((j) => j.status === 'running' || j.status === 'pending') ?? null,
    paperlessUrl: locals.config.PAPERLESS_URL.replace(/\/+$/, ''),
  };
};
