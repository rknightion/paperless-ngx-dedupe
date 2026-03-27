import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getDedupConfig,
  setDedupConfig,
  recalculateConfidenceScores,
  checkAnalysisStaleness,
  dedupConfigBaseSchema,
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
  const partialSchema = dedupConfigBaseSchema.partial();
  const parseResult = partialSchema.safeParse(body);

  if (!parseResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid dedup configuration',
      parseResult.error.issues,
    );
  }

  // Backward compatibility: convert old SDK field name
  if (typeof body === 'object' && body !== null && 'confidenceWeightDiscriminative' in body) {
    const b = body as Record<string, unknown>;
    if (!('discriminativePenaltyStrength' in b)) {
      const d = Number(b.confidenceWeightDiscriminative) || 0;
      b.discriminativePenaltyStrength = Math.min(100, Math.round((d / 15) * 70));
    }
    delete b.confidenceWeightDiscriminative;
  }

  // Check if weight keys are being changed
  const weightKeys = [
    'confidenceWeightJaccard',
    'confidenceWeightFuzzy',
    'discriminativePenaltyStrength',
  ] as const;
  const weightsChanged = weightKeys.some((k) => k in parseResult.data);

  let config;
  try {
    config = setDedupConfig(locals.db, parseResult.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update configuration';
    return apiError(ErrorCode.VALIDATION_FAILED, message);
  }

  const meta: Record<string, unknown> = {};
  if (weightsChanged) {
    meta.recalculatedGroups = recalculateConfidenceScores(locals.db, config);
  }

  const staleness = checkAnalysisStaleness(locals.db);
  if (staleness.isStale) {
    meta.analysisStale = true;
  }

  return apiSuccess(config, Object.keys(meta).length > 0 ? meta : undefined);
};
