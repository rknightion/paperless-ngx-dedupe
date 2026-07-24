import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import { ConfigValidationError } from '@paperless-dedupe/core/config/registry';
import { importConfig, previewConfigImport } from '@paperless-dedupe/core/export/config';
import { z, ZodError } from 'zod';
import type { RequestHandler } from './$types';

const previewRequestSchema = z
  .object({
    mode: z.literal('preview'),
    backup: z.unknown(),
  })
  .strict();
const applyRequestSchema = z
  .object({
    mode: z.literal('apply'),
    backup: z.unknown(),
    confirmScheduledAiOptIn: z.boolean().default(false),
  })
  .strict();
const importRequestSchema = z.discriminatedUnion('mode', [
  previewRequestSchema,
  applyRequestSchema,
]);

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid JSON body');
  }

  try {
    const wrapped =
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      ('mode' in body || 'backup' in body);
    if (wrapped) {
      const requestResult = importRequestSchema.safeParse(body);
      if (!requestResult.success) {
        return apiError(ErrorCode.VALIDATION_FAILED, {
          operation: 'import_config',
          validationIssues: requestResult.error.issues,
        });
      }
      if (requestResult.data.mode === 'preview') {
        return apiSuccess(previewConfigImport(requestResult.data.backup));
      }
      return apiSuccess(
        importConfig(locals.db, requestResult.data.backup, {
          confirmScheduledAiOptIn: requestResult.data.confirmScheduledAiOptIn,
        }),
      );
    }

    // Existing raw backup uploads remain valid, but cannot implicitly confirm
    // migration of the retired auto-process behavior.
    const result = importConfig(locals.db, body, {
      confirmScheduledAiOptIn: false,
    });
    return apiSuccess(result);
  } catch (err) {
    if (err instanceof ZodError || err instanceof ConfigValidationError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'import_config',
        validationIssues:
          err instanceof ZodError ? err.issues : [{ path: [err.key], message: err.reason }],
      });
    }
    throw err;
  }
};
