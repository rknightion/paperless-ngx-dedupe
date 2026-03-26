import { getAiResults, getUnprocessedDocuments } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const unprocessed = getUnprocessedDocuments(locals.db, limit, offset);
  const failed = getAiResults(locals.db, { status: 'failed' }, 50, 0);

  return { unprocessed, failed };
};
