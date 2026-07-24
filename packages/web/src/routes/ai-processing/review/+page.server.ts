import { listAiReviewInbox, getAiConfig } from '@paperless-dedupe/core';
import { safeDocumentReturnTarget } from '$lib/utils/safe-return';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const aiConfig = getAiConfig(locals.db);
  const requestedQueue = url.searchParams.get('queue');
  const queue =
    requestedQueue === 'failures' || requestedQueue === 'history' ? requestedQueue : 'review';
  const search = url.searchParams.get('search')?.trim() || undefined;
  const changedOnly = url.searchParams.get('changedOnly') === 'true' || undefined;
  const provider = url.searchParams.get('provider') || undefined;
  const model = url.searchParams.get('model') || undefined;
  const documentId = url.searchParams.get('documentId')?.trim() || undefined;
  const returnTo = safeDocumentReturnTarget(url.searchParams.get('returnTo'));
  const requestedFailureCategory = url.searchParams.get('failureCategory');
  const failureCategory =
    requestedFailureCategory === 'temporary' ||
    requestedFailureCategory === 'no_content' ||
    requestedFailureCategory === 'extraction' ||
    requestedFailureCategory === 'configuration'
      ? requestedFailureCategory
      : undefined;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const cursor = url.searchParams.get('cursor') || undefined;
  const page = listAiReviewInbox(locals.db, {
    queue,
    limit,
    cursor,
    search,
    changedOnly,
    provider,
    model,
    ...(documentId ? { documentId } : {}),
    ...(failureCategory ? { failureCategory } : {}),
  });

  return {
    results: page.items,
    total: page.total,
    limit,
    offset: 0,
    queue,
    cursor: cursor ?? null,
    nextCursor: page.nextCursor,
    previousCursor: page.previousCursor,
    failureGroups: page.failureGroups,
    status: queue === 'review' ? 'pending_review' : queue === 'failures' ? 'failed' : undefined,
    search,
    sort: 'confidence_desc' as const,
    groupBy: null,
    changedOnly,
    failed: queue === 'failures',
    minConfidence: undefined,
    maxConfidence: undefined,
    provider: provider ?? null,
    model: model ?? null,
    failureCategory: failureCategory ?? null,
    documentId: documentId ?? null,
    returnTo,
    groups: null,
    extractEnabled: {
      title: aiConfig.extractTitle,
      correspondent: aiConfig.extractCorrespondent,
      documentType: aiConfig.extractDocumentType,
      tags: aiConfig.extractTags,
      customFields: aiConfig.extractCustomFields,
      processedTag: aiConfig.addProcessedTag,
    },
  };
};
