import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import { parseUniqueJson } from '$lib/server/unique-json';
import {
  getFirstRunChecklistDismissed,
  setFirstRunChecklistDismissed,
} from '@paperless-dedupe/core';
import { ConfigValidationError } from '@paperless-dedupe/core/config/registry';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const dismissalSchema = z.object({ dismissed: z.boolean() }).strict();

export const GET: RequestHandler = ({ locals }) => {
  return apiSuccess({ dismissed: getFirstRunChecklistDismissed(locals.db) });
};

// Same rules as PUT /api/v1/config: this writes the app's own config store, so
// PAPERLESS_READ_ONLY (which guards changes to Paperless) does not apply. Access
// control comes from the global auth hook, and the value is validated by the
// config registry inside core.
export const PUT: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = parseUniqueJson(await request.text());
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_first_run_checklist',
      validationIssues: [{ path: [], message: 'Invalid JSON body' }],
    });
  }

  const parsed = dismissalSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_first_run_checklist',
      validationIssues: parsed.error.issues,
    });
  }

  try {
    return apiSuccess({
      dismissed: setFirstRunChecklistDismissed(locals.db, parsed.data.dismissed),
    });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_first_run_checklist',
        validationIssues: [{ path: [error.key], message: error.reason }],
      });
    }
    throw error;
  }
};
