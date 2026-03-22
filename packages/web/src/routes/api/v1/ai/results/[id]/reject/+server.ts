import { apiSuccess } from '$lib/server/api';
import { markAiResultRejected } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
  markAiResultRejected(locals.db, params.id);
  return apiSuccess({ rejected: true });
};
