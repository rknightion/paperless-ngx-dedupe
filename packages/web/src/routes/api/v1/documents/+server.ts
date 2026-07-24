import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { readScalarSearchParams, ScalarSearchParamError } from '$lib/server/scalar-search-params';
import { getDocuments, paginationSchema, documentFiltersSchema } from '@paperless-dedupe/core';
import { listDocumentLibrary } from '@paperless-dedupe/core/queries/documents';
import { documentLibraryQuerySchema } from '@paperless-dedupe/core/queries/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (url.searchParams.has('library')) {
    let state: Record<string, string>;
    try {
      state = readScalarSearchParams(url.searchParams);
    } catch (error) {
      if (!(error instanceof ScalarSearchParamError)) throw error;
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'list_document_library',
        retryable: false,
        validationIssues: [{ path: [error.parameter], message: error.message }],
      });
    }
    const librarySelector = state.library;
    delete state.library;
    const queryResult =
      librarySelector === 'true'
        ? documentLibraryQuerySchema.safeParse(state)
        : {
            success: false as const,
            error: {
              issues: [{ path: ['library'], message: 'library must be true' }],
            },
          };

    if (!queryResult.success) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'list_document_library',
        retryable: false,
        validationIssues: queryResult.error.issues,
      });
    }

    const page = listDocumentLibrary(locals.db, queryResult.data);
    return apiSuccess(page.items, {
      nextCursor: page.nextCursor,
      counts: page.counts,
      query: page.query,
    });
  }

  const paginationResult = paginationSchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!paginationResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid pagination parameters',
      paginationResult.error.issues,
    );
  }

  const filtersResult = documentFiltersSchema.safeParse({
    correspondent: url.searchParams.get('correspondent') ?? undefined,
    documentType: url.searchParams.get('documentType') ?? undefined,
    tag: url.searchParams.get('tag') ?? undefined,
    processingStatus: url.searchParams.get('processingStatus') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    noAiResult: url.searchParams.get('noAiResult') ?? undefined,
  });

  if (!filtersResult.success) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Invalid filter parameters',
      filtersResult.error.issues,
    );
  }

  const result = getDocuments(locals.db, filtersResult.data, paginationResult.data);
  return apiSuccess(result.items, {
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
};
