import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  discoverCustomFieldCandidates,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let existingFieldNames: string[] = [];
  let warning: string | null = null;
  try {
    const client = new PaperlessClient(toPaperlessConfig(locals.config));
    existingFieldNames = (await client.getCustomFields()).map((field) => field.name);
  } catch (error) {
    warning = `Paperless custom fields could not be loaded, so existing fields may appear in the recommendations: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  const result = discoverCustomFieldCandidates(locals.db, { existingFieldNames });
  return apiSuccess({
    ...result,
    existingFieldNames,
    warning,
  });
};
