import { apiSuccess } from '$lib/server/api';
import { getAiResults } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const { items, total } = getAiResults(locals.db, { status, search }, limit, offset);

  return apiSuccess(items, { total, limit, offset });
};
