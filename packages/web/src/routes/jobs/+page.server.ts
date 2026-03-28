import { listJobs } from '@paperless-dedupe/core';
import type { JobType, JobStatus } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const type = (url.searchParams.get('type') ?? undefined) as JobType | undefined;
  const status = (url.searchParams.get('status') ?? undefined) as JobStatus | undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 200, 200) : 200;

  const jobs = listJobs(locals.db, { type, status, limit });

  return { jobs, filters: { type: type ?? null, status: status ?? null } };
};
