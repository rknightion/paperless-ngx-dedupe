import { apiSuccess } from '$lib/server/api';
import { OPENAI_MODELS, ANTHROPIC_MODELS } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const provider = url.searchParams.get('provider') ?? 'openai';

  const models = provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;
  return apiSuccess(models);
};
