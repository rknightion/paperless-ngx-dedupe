import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getConfig, setConfig, setConfigBatch } from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const singleConfigSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const batchConfigSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

export const GET: RequestHandler = async ({ locals }) => {
  const config = getConfig(locals.db);
  return apiSuccess(config);
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  // Try single config first, then batch
  const singleResult = singleConfigSchema.safeParse(body);
  if (singleResult.success) {
    setConfig(locals.db, singleResult.data.key, singleResult.data.value);
    const config = getConfig(locals.db);
    return apiSuccess(config);
  }

  const batchResult = batchConfigSchema.safeParse(body);
  if (batchResult.success) {
    setConfigBatch(locals.db, batchResult.data.settings);
    const config = getConfig(locals.db);
    return apiSuccess(config);
  }

  return apiError(
    ErrorCode.VALIDATION_FAILED,
    'Invalid request body. Provide either { key, value } or { settings }',
    batchResult.error.issues,
  );
};
