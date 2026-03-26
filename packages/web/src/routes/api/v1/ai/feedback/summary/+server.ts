import { apiSuccess } from '$lib/server/api';
import { getFeedbackSummary } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const summary = getFeedbackSummary(locals.db);
  return apiSuccess(summary);
};
