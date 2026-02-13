import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDedupConfig,
  setDedupConfig,
  recalculateConfidenceScores,
  dedupConfigSchema,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const config = getDedupConfig(locals.db);
  return apiSuccess(config);
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Content-Type must be application/json');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  // Validate partial config
  const partialSchema = dedupConfigSchema.innerType().partial();
  const parseResult = partialSchema.safeParse(body);

  if (!parseResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid dedup configuration',
      parseResult.error.issues,
    );
  }

  // Check if weight keys are being changed
  const weightKeys = [
    'confidenceWeightJaccard',
    'confidenceWeightFuzzy',
    'confidenceWeightMetadata',
    'confidenceWeightFilename',
  ] as const;
  const weightsChanged = weightKeys.some((k) => k in parseResult.data);

  let config;
  try {
    config = setDedupConfig(locals.db, parseResult.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update configuration';
    return apiError(ErrorCode.VALIDATION_FAILED, message);
  }

  let meta: Record<string, unknown> | undefined;
  if (weightsChanged) {
    const recalculated = recalculateConfidenceScores(locals.db, config);
    meta = { recalculatedGroups: recalculated };
  }

  return apiSuccess(config, meta);
};
