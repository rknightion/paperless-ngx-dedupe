import { apiSuccess } from '$lib/server/api';
import { getDashboard } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const data = getDashboard(locals.db);
  return apiSuccess(data);
};
