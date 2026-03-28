import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  getAiConfig,
  estimateProcessingCost,
  PaperlessClient,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const aiConfig = getAiConfig(locals.db);
  const paperlessConfig = toPaperlessConfig(locals.config);
  const client = new PaperlessClient(paperlessConfig);

  // Fetch reference data from Paperless (same as batch processing does)
  const [correspondents, documentTypes, tags] = await Promise.all([
    aiConfig.includeCorrespondents
      ? client.getCorrespondents().then((list) => list.map((c) => c.name))
      : Promise.resolve([] as string[]),
    aiConfig.includeDocumentTypes
      ? client.getDocumentTypes().then((list) => list.map((dt) => dt.name))
      : Promise.resolve([] as string[]),
    aiConfig.includeTags
      ? client.getTags().then((list) => list.map((t) => t.name))
      : Promise.resolve([] as string[]),
  ]);

  const estimate = await estimateProcessingCost(locals.db, {
    config: aiConfig,
    existingCorrespondents: correspondents,
    existingDocumentTypes: documentTypes,
    existingTags: tags,
  });

  if (!estimate) {
    return apiError(ErrorCode.NOT_FOUND, 'No pricing data available or no unprocessed documents');
  }

  return apiSuccess(estimate);
};
