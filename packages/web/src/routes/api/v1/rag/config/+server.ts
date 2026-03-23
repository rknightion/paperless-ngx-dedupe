import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getRagConfig, setRagConfig, ragConfigSchema } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }
  const config = getRagConfig(locals.db);
  return apiSuccess(config);
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  const body = await request.json();
  const result = ragConfigSchema.partial().safeParse(body);

  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid RAG configuration', result.error.issues);
  }

  const updated = setRagConfig(locals.db, result.data);
  return apiSuccess(updated);
};
