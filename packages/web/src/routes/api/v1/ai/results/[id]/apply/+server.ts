import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  applyAiResult,
  getAiConfig,
  markAiResultFailed,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  let allowClearing = false;
  let createMissingEntities = true;
  let fields: ('title' | 'correspondent' | 'documentType' | 'tags')[] = [
    'title',
    'correspondent',
    'documentType',
    'tags',
  ];

  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const body = await request.json();
      if (Array.isArray(body?.fields)) {
        fields = body.fields.filter((f: string) =>
          ['title', 'correspondent', 'documentType', 'tags'].includes(f),
        );
      }
      allowClearing = body?.allowClearing === true;
      createMissingEntities = body?.createMissingEntities !== false;
    } catch {
      // Use defaults
    }
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  try {
    await applyAiResult(locals.db, client, params.id, {
      fields,
      allowClearing,
      createMissingEntities,
      addProcessedTag: aiConfig.addProcessedTag,
      processedTagName: aiConfig.processedTagName,
      protectedTagsEnabled: aiConfig.protectedTagsEnabled,
      protectedTagNames: aiConfig.protectedTagNames,
    });
    return apiSuccess({ applied: true });
  } catch (error) {
    const errMsg = (error as Error).message;
    // Mark as failed in DB if not already marked by applyAiResult
    try {
      markAiResultFailed(locals.db, params.id, errMsg);
    } catch {
      // DB update failed — original error already logged
    }
    return apiError(ErrorCode.INTERNAL_ERROR, errMsg);
  }
};
