import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { createJob, JobAlreadyRunningError, JobType, launchWorker } from '@paperless-dedupe/core';
import type { ApplyScope } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
import type { AiApplyField } from '@paperless-dedupe/core';
import { resolveServerWorkerPath } from '$lib/server/job-dispatcher';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../../runtime.server';

export const POST: RequestHandler = async ({ request, locals }) => {
  const runtime = await getServerRuntime();
  try {
    runtime.acceptingGate.assertAccepting();

    if (!locals.config.AI_ENABLED) {
      return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
    }

    const body = await request.json();
    const resultIds: string[] = body?.resultIds ?? [];
    let fields: AiApplyField[] = ['title', 'correspondent', 'documentType', 'tags'];

    if (Array.isArray(body?.fields)) {
      fields = body.fields.filter((f: string) =>
        ['title', 'correspondent', 'documentType', 'tags', 'customFields'].includes(f),
      );
    }

    const allowClearing = body?.allowClearing === true;
    const createMissingEntities = body?.createMissingEntities !== false;

    // Support both explicit scope and legacy resultIds
    let scope: ApplyScope;
    if (body?.scope) {
      scope = body.scope;
    } else {
      if (resultIds.length === 0) {
        return apiError(ErrorCode.BAD_REQUEST, 'No result IDs provided');
      }
      scope = { type: 'selected_result_ids', resultIds };
    }

    return runtime.acceptingGate.run(() => {
      const jobId = createJob(locals.db, JobType.AI_APPLY);
      const workerPath = resolveServerWorkerPath('ai-apply-worker');
      launchWorker({
        jobId,
        dbPath: locals.config.DATABASE_URL,
        workerScriptPath: workerPath,
        taskData: { scope, fields, allowClearing, createMissingEntities },
      });
      return apiSuccess({ jobId }, undefined, 202);
    });
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'ai_batch_apply', retryable: true },
        503,
      );
    }
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }
};
