import { apiSuccess } from '$lib/server/api';
import { OPENAI_MODELS } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return apiSuccess(OPENAI_MODELS);
};
