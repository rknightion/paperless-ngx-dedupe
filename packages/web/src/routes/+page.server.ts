import { getDashboard, getDuplicateStats, listJobs } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const dashboard = getDashboard(locals.db);
  const jobs = listJobs(locals.db, { limit: 5 });
  const duplicateStats = getDuplicateStats(locals.db);

  return { dashboard, jobs, duplicateStats };
};
