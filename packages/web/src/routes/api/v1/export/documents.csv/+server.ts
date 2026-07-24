import { apiError, ErrorCode } from '$lib/server/api';
import { readScalarSearchParams, ScalarSearchParamError } from '$lib/server/scalar-search-params';
import { streamDocumentLibraryCsv } from '@paperless-dedupe/core/export/documents';
import { documentLibraryQuerySchema } from '@paperless-dedupe/core/queries/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  let state: Record<string, string>;
  try {
    state = readScalarSearchParams(url.searchParams);
  } catch (error) {
    if (!(error instanceof ScalarSearchParamError)) throw error;
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'export_document_library',
      retryable: false,
      validationIssues: [{ path: [error.parameter], message: error.message }],
    });
  }

  const queryResult = documentLibraryQuerySchema.safeParse(state);
  if (!queryResult.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, {
      operation: 'export_document_library',
      retryable: false,
      validationIssues: queryResult.error.issues,
    });
  }

  const chunks = streamDocumentLibraryCsv(locals.db, queryResult.data);
  let primedChunk: IteratorResult<string>;
  try {
    primedChunk = chunks.next();
  } catch {
    chunks.return?.();
    return apiError(ErrorCode.INTERNAL_ERROR, {
      operation: 'export_document_library',
      retryable: true,
    });
  }

  const encoder = new TextEncoder();
  let hasPrimedChunk = true;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        try {
          const chunk = hasPrimedChunk ? primedChunk : chunks.next();
          hasPrimedChunk = false;
          if (chunk.done) {
            controller.close();
          } else {
            controller.enqueue(encoder.encode(chunk.value));
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        chunks.return?.();
      },
    },
    { highWaterMark: 0 },
  );

  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="documents-${date}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
