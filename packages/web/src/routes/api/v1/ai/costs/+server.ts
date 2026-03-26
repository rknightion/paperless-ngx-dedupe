import { apiSuccess } from '$lib/server/api';
import { getCostStats } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const days = url.searchParams.has('days')
    ? parseInt(url.searchParams.get('days')!, 10) || undefined
    : undefined;
  const stats = getCostStats(locals.db, days);
  return apiSuccess(stats);
};
