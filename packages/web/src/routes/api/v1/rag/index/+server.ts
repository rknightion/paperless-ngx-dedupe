import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  createJob,
  JobAlreadyRunningError,
  JobType,
  launchWorker,
  getWorkerPath,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.RAG_ENABLED) {
    return apiError(ErrorCode.NOT_FOUND, 'Document Q&A is not enabled');
  }

  if (!locals.config.AI_OPENAI_API_KEY) {
    return apiError(ErrorCode.BAD_REQUEST, 'OpenAI API key is required for indexing');
  }

  let rebuild = false;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      rebuild = body?.rebuild === true;
    } catch {
      // Ignore parse errors
    }
  }

  let jobId: string;
  try {
    jobId = createJob(locals.db, JobType.RAG_INDEXING);
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, error.message);
    }
    throw error;
  }

  const workerPath = getWorkerPath('rag-indexing-worker');
  launchWorker({
    jobId,
    dbPath: locals.config.DATABASE_URL,
    workerScriptPath: workerPath,
    taskData: { rebuild },
  });

  return apiSuccess({ jobId }, undefined, 202);
};
