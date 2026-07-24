import { ZodError } from 'zod';
import { getAutomationSettings, updateAutomationSchedule } from '@paperless-dedupe/core';

import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

function validationIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));
}

export const GET: RequestHandler = ({ locals }) => {
  return apiSuccess(getAutomationSettings(locals.sqlite));
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'update_automation_schedule',
      retryable: false,
      validationIssues: [{ path: [], message: 'Request body must be valid JSON' }],
    });
  }

  try {
    return apiSuccess(updateAutomationSchedule(locals.sqlite, body));
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'update_automation_schedule',
        retryable: false,
        validationIssues: validationIssues(error),
      });
    }
    throw error;
  }
};
