import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import {
  getAiConfig,
  setAiConfig,
  aiConfigSchema,
  validateTagAliasYaml,
  CustomFieldPolicyError,
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
  const result = aiConfigSchema.partial().safeParse(bodyObject);

  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid AI configuration', result.error.issues);
  }

  const sent = Object.fromEntries(Object.entries(result.data).filter(([key]) => key in bodyObject));

  // Validate tag alias YAML if provided
  if (typeof sent.tagAliasMap === 'string') {
    const aliasValidation = validateTagAliasYaml(sent.tagAliasMap);
    if (!aliasValidation.valid) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        `Invalid tag alias map: ${aliasValidation.error}`,
      );
    }
  }

  try {
    const updated = setAiConfig(locals.db, sent);
    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof CustomFieldPolicyError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_ai_config',
        validationIssues: [
          {
            path: ['extractCustomFields'],
            message: error.code,
          },
        ],
      });
    }
    throw error;
  }
};
