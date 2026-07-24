import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import {
  CustomFieldPolicyError,
  getCustomFieldPolicy,
  PaperlessApiError,
  PaperlessClient,
  PaperlessConnectionError,
  replaceCustomFieldPolicy,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const policyRequestSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            fieldId: z.number().int().positive(),
            guidance: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

function clientFor(locals: App.Locals): PaperlessClient {
  return new PaperlessClient(toPaperlessConfig(locals.config));
}

function upstreamOrInternalError(operation: string, error: unknown) {
  if (error instanceof PaperlessApiError || error instanceof PaperlessConnectionError) {
    return apiError(ErrorCode.BAD_GATEWAY, { operation, retryable: true });
  }
  return apiError(ErrorCode.INTERNAL_ERROR, { operation, retryable: false });
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, {
      operation: 'get_custom_field_policy',
      retryable: false,
    });
  }

  try {
    const liveFields = await clientFor(locals).getCustomFields();
    const availableFields = liveFields
      .filter(({ dataType }) => dataType !== 'documentlink')
      .sort((left, right) => left.id - right.id);
    return apiSuccess({
      policy: getCustomFieldPolicy(locals.db),
      availableFields,
    });
  } catch (error) {
    return upstreamOrInternalError('get_custom_field_policy', error);
  }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, {
      operation: 'update_custom_field_policy',
      retryable: false,
    });
  }

  let body: unknown;
  try {
    body = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_custom_field_policy',
      validationIssues: [{ path: [], message: 'invalid_json' }],
    });
  }

  const parsed = policyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_custom_field_policy',
      validationIssues: parsed.error.issues,
    });
  }
  try {
    const liveFields = await clientFor(locals).getCustomFields();
    const policy = replaceCustomFieldPolicy(locals.db, parsed.data.fields, liveFields);
    return apiSuccess({ policy });
  } catch (error) {
    if (error instanceof CustomFieldPolicyError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_custom_field_policy',
        validationIssues: [
          {
            path: ['fields', error.fieldId ?? 'policy'],
            message: error.code,
          },
        ],
      });
    }
    return upstreamOrInternalError('update_custom_field_policy', error);
  }
};
