import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getAiConfig,
  setAiConfig,
  aiConfigSchema,
  validateTagAliasYaml,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }
  const config = getAiConfig(locals.db);
  return apiSuccess(config);
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const body = await request.json();
  const result = aiConfigSchema.partial().safeParse(body);

  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid AI configuration', result.error.issues);
  }

  // Validate tag alias YAML if provided
  if (typeof result.data.tagAliasMap === 'string') {
    const aliasValidation = validateTagAliasYaml(result.data.tagAliasMap);
    if (!aliasValidation.valid) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        `Invalid tag alias map: ${aliasValidation.error}`,
      );
    }
  }

  const updated = setAiConfig(locals.db, result.data);
  return apiSuccess(updated);
};
