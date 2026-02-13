import { apiSuccess } from '$lib/server/api';
import { getDuplicateStats } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const stats = getDuplicateStats(locals.db);
  return apiSuccess(stats);
};
