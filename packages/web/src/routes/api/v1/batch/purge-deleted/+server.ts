import { apiSuccess } from '$lib/server/api';
import { purgeDeletedGroups } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  const result = purgeDeletedGroups(locals.db);
  return apiSuccess(result);
};
