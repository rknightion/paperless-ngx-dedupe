import { getDocumentStats } from '@paperless-dedupe/core';
import { getDataQualityInsights } from '@paperless-dedupe/core/queries/data-quality';
import { listDocumentLibrary } from '@paperless-dedupe/core/queries/documents';
import { documentLibraryQuerySchema } from '@paperless-dedupe/core/queries/types';
import { readScalarSearchParams, ScalarSearchParamError } from '$lib/server/scalar-search-params';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const stats = getDocumentStats(locals.db);
  const paperlessUrl = locals.config.PAPERLESS_URL;
  const aiEnabled = locals.config.AI_ENABLED;

  if (!url.searchParams.has('library')) {
    return { stats, paperlessUrl, aiEnabled };
  }

  let state: Record<string, string>;
  try {
    state = readScalarSearchParams(url.searchParams);
  } catch (cause) {
    if (!(cause instanceof ScalarSearchParamError)) throw cause;
    throw error(400, 'Invalid document library query');
  }
  if (state.library !== 'true') {
    throw error(400, 'Invalid document library query');
  }
  delete state.library;

  const queryResult = documentLibraryQuerySchema.safeParse(state);
  if (!queryResult.success) throw error(400, 'Invalid document library query');

  const library = listDocumentLibrary(locals.db, queryResult.data);
  const dataQuality = getDataQualityInsights(locals.db);
  return { stats, paperlessUrl, aiEnabled, library, dataQuality };
};
