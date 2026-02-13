import { apiSuccess } from '$lib/server/api';
import { getDocumentStats } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const data = getDocumentStats(locals.db);
  return apiSuccess(data);
};
