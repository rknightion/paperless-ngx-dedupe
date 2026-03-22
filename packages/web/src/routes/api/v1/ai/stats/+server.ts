import { apiSuccess } from '$lib/server/api';
import { getAiStats } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const stats = getAiStats(locals.db);
  return apiSuccess(stats);
};
