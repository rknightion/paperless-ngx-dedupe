import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import {
  getConfig,
  redactSensitiveConfig,
  setConfig,
  setConfigBatch,
} from '@paperless-dedupe/core';
import { ConfigValidationError, getConfigMetadata } from '@paperless-dedupe/core/config/registry';
import { CustomFieldPolicyError } from '@paperless-dedupe/core';
import { z, ZodError } from 'zod';
import type { RequestHandler } from './$types';

const singleConfigSchema = z
  .object({
    key: z.string().min(1),
    value: z.unknown(),
  })
  .strict();

const batchConfigSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()),
  })
  .strict();

export const GET: RequestHandler = async ({ locals }) => {
  const config = getConfig(locals.db);
  return apiSuccess(redactSensitiveConfig(config), { registry: getConfigMetadata() });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  try {
    // Keep the established single/batch request shapes while validating values
    // against the same typed registry in core.
    const singleResult = singleConfigSchema.safeParse(body);
    if (singleResult.success) {
      setConfig(locals.db, singleResult.data.key, singleResult.data.value);
      const config = getConfig(locals.db);
      return apiSuccess(redactSensitiveConfig(config), { registry: getConfigMetadata() });
    }

    const batchResult = batchConfigSchema.safeParse(body);
    if (batchResult.success) {
      setConfigBatch(locals.db, batchResult.data.settings);
      const config = getConfig(locals.db);
      return apiSuccess(redactSensitiveConfig(config), { registry: getConfigMetadata() });
    }

    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_config',
      validationIssues: batchResult.error.issues,
    });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_config',
        validationIssues: [{ path: [error.key], message: error.reason }],
      });
    }
    if (error instanceof CustomFieldPolicyError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_config',
        validationIssues: [{ path: ['ai.extractCustomFields'], message: error.message }],
      });
    }
    if (error instanceof ZodError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_config',
        validationIssues: error.issues,
      });
    }
    throw error;
  }
};
