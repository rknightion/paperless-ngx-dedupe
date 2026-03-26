import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getAiResultGroups } from '@paperless-dedupe/core';
import type { AiResultFilters, GroupByField } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

const VALID_GROUP_BY: GroupByField[] = [
  'suggestedCorrespondent',
  'suggestedDocumentType',
  'failureType',
  'confidenceBand',
];

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const groupBy = url.searchParams.get('groupBy') as GroupByField | null;
  if (!groupBy || !VALID_GROUP_BY.includes(groupBy)) {
    return apiError(ErrorCode.BAD_REQUEST, `groupBy must be one of: ${VALID_GROUP_BY.join(', ')}`);
  }

  const filters: AiResultFilters = {};
  const status = url.searchParams.get('status');
  if (status) filters.status = status;
  const search = url.searchParams.get('search');
  if (search) filters.search = search;
  if (url.searchParams.get('failed') === 'true') filters.failed = true;
  const minConfidence = url.searchParams.get('minConfidence');
  if (minConfidence) filters.minConfidence = parseFloat(minConfidence);
  const maxConfidence = url.searchParams.get('maxConfidence');
  if (maxConfidence) filters.maxConfidence = parseFloat(maxConfidence);
  const provider = url.searchParams.get('provider');
  if (provider) filters.provider = provider;
  const model = url.searchParams.get('model');
  if (model) filters.model = model;
  if (url.searchParams.get('changedOnly') === 'true') filters.changedOnly = true;

  const result = getAiResultGroups(locals.db, groupBy, filters);

  return apiSuccess(result);
};
