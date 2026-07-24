import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { createJob, JobAlreadyRunningError, JobType, launchWorker } from '@paperless-dedupe/core';
import type { AiApplyField, ApplyScope } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';
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
    if (!locals.config.AI_BULK_ALL_ENABLED) {
      return apiError(
        ErrorCode.UNAUTHORIZED,
        'Bulk apply-all is disabled. Set AI_BULK_ALL_ENABLED=true to enable it.',
      );
    }

    let allowClearing = false;
    let createMissingEntities = true;
    let fields: AiApplyField[] = ['title', 'correspondent', 'documentType', 'tags'];
    let scope: ApplyScope = { type: 'all_pending' };

    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const body = await request.json();
        allowClearing = body?.allowClearing === true;
        createMissingEntities = body?.createMissingEntities !== false;

        if (Array.isArray(body?.fields)) {
          fields = body.fields.filter((f: string) =>
            ['title', 'correspondent', 'documentType', 'tags', 'customFields'].includes(f),
          );
        }

        // Support filter-scoped apply-all
        if (body?.scope) {
          scope = body.scope;
        } else if (body?.filters) {
          scope = { type: 'current_filter', filters: body.filters };
        }
      } catch {
        // Use defaults
      }
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
        { operation: 'ai_apply_all', retryable: true },
        503,
      );
    }
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }
};
