import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import {
  getLatestCustomFieldDiscoveryRun,
  JobType,
  OperationConflictError,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import { getServerRuntime } from '../../../../../../runtime.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) =>
  apiSuccess({ run: getLatestCustomFieldDiscoveryRun(locals.db) });

export const POST: RequestHandler = async ({ locals }) => {
  let existingFieldNames: string[] = [];
  let existingFieldsUnavailable = false;
  try {
    const client = new PaperlessClient(toPaperlessConfig(locals.config));
    existingFieldNames = (await client.getCustomFields())
      .map((field) => field.name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    existingFieldsUnavailable = true;
  }

  try {
    const runtime = await getServerRuntime();
    const intent = runtime.enqueueManual('custom_field_discovery', JobType.CUSTOM_FIELD_DISCOVERY, {
      existingFieldNames,
    });
    await runtime.dispatchPending();
    return apiSuccess({ jobId: intent.jobId, existingFieldsUnavailable }, undefined, 202);
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'custom_field_discovery', retryable: true },
        503,
      );
    }
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, {
        operation: 'custom_field_discovery',
        retryable: true,
      });
    }
    throw error;
  }
};
