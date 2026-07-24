import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { createJob, JobAlreadyRunningError, JobType } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../../../runtime.server';

export const POST: RequestHandler = async ({ request, locals }) => {
  const runtime = await getServerRuntime();
  try {
    runtime.acceptingGate.assertAccepting();
    if (!locals.config.AI_ENABLED) {
      return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
    }
    const body = await request.json();
    const planToken = body?.planToken;
    if (typeof planToken !== 'string' || planToken.length < 16) {
      return apiError(ErrorCode.BAD_REQUEST, 'A reviewed AI apply plan token is required');
    }
    return runtime.acceptingGate.run(async () => {
      const jobId = createJob(locals.db, JobType.AI_APPLY, { planToken });
      await runtime.dispatchPending();
      return apiSuccess({ jobId }, undefined, 202);
    });
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        {
          operation: 'ai_apply',
          retryable: true,
        },
        503,
      );
    }
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }
};
