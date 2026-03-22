import { apiSuccess } from '$lib/server/api';
import { rejectAiResult } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  rejectAiResult(locals.db, params.id);
  return apiSuccess({ rejected: true });
};
