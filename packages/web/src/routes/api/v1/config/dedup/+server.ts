import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
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
    body = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Configuration must be an object');
  }
  const bodyObject: Record<string, unknown> = { ...body };

  // Backward compatibility: convert old SDK field name
  if ('confidenceWeightDiscriminative' in bodyObject) {
    if (!('discriminativePenaltyStrength' in bodyObject)) {
      const d = Number(bodyObject.confidenceWeightDiscriminative) || 0;
      bodyObject.discriminativePenaltyStrength = Math.min(100, Math.round((d / 15) * 70));
    }
    delete bodyObject.confidenceWeightDiscriminative;
  }

  // Validate partial config
  const partialSchema = dedupConfigBaseSchema.partial();
  const parseResult = partialSchema.safeParse(bodyObject);

  if (!parseResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid dedup configuration',
      parseResult.error.issues,
    );
  }

  const sent = Object.fromEntries(
    Object.entries(parseResult.data).filter(([key]) => key in bodyObject),
  );

  // Check if weight keys are being changed
  const weightKeys = [
    'confidenceWeightJaccard',
    'confidenceWeightFuzzy',
    'discriminativePenaltyStrength',
  ] as const;
  const weightsChanged = weightKeys.some((k) => k in sent);

  let config;
  try {
    config = setDedupConfig(locals.db, sent);
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
