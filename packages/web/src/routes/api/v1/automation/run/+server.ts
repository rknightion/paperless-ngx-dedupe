import { z } from 'zod';
import { JobType, OperationConflictError } from '@paperless-dedupe/core';

import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../runtime.server';
import type { RequestHandler } from './$types';

const manualRunSchema = z
  .object({
    task: z.enum(['sync', 'analysis', 'ai_processing']),
  })
  .strict();

const JOB_TYPE = {
  sync: JobType.SYNC,
  analysis: JobType.ANALYSIS,
  ai_processing: JobType.AI_PROCESSING,
} as const;

export const POST: RequestHandler = async ({ request, locals }) => {
  let parsed: z.infer<typeof manualRunSchema>;
  try {
    parsed = manualRunSchema.parse(await request.json());
  } catch (error) {
    const issues =
      error instanceof z.ZodError
        ? error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          }))
        : [{ path: [], message: 'Request body must be valid JSON' }];
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'manual_automation_run',
      retryable: false,
      validationIssues: issues,
    });
  }
  if (parsed.task === 'ai_processing' && !locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, {
      operation: 'manual_automation_run',
      retryable: false,
    });
  }

  const runtime = await getServerRuntime();
  try {
    const intent = runtime.enqueueManual(parsed.task, JOB_TYPE[parsed.task]);
    await runtime.dispatchPending();
    return apiSuccess({ jobId: intent.jobId }, undefined, 202);
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(ErrorCode.SERVICE_UNAVAILABLE, {
        operation: 'manual_automation_run',
        retryable: true,
      });
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, {
        operation: 'manual_automation_run',
        retryable: false,
      });
    }
    throw error;
  }
};
