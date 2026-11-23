import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getJob, retryDeadLetterJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
import { getServerRuntime } from '../../../../../../runtime.server';

const PAPERLESS_WRITING_JOBS = new Set([
  'batch_operation',
  'duplicate_restore',
  'ai_apply',
  'ai_revert',
]);

export const POST: RequestHandler = async ({ params, locals }) => {
  const job = getJob(locals.db, params.jobId);
  if (!job) return apiError(ErrorCode.NOT_FOUND, { operation: 'job_retry', retryable: false });
  if (locals.config.PAPERLESS_READ_ONLY && PAPERLESS_WRITING_JOBS.has(job.type)) {
    return apiError(ErrorCode.READ_ONLY, { operation: 'job_retry', retryable: false });
  }

  const runtime = await getServerRuntime();
  try {
    runtime.acceptingGate.assertAccepting();
    return await runtime.acceptingGate.run(async () => {
      if (!retryDeadLetterJob(locals.db, params.jobId)) {
        return apiError(ErrorCode.CONFLICT, { operation: 'job_retry', retryable: false });
      }
      await runtime.dispatchPending();
      return apiSuccess({ jobId: params.jobId, status: 'pending' }, undefined, 202);
    });
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'job_retry', retryable: true },
        503,
      );
    }
    throw error;
  }
};
