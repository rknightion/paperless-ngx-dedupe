import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import {
  document,
  deleteDocumentLocally,
  incrementUsageStats,
  removeDocumentFromAllGroups,
  duplicateMember,
  OperationConflictError,
  withDuplicateMutationLeaseAsync,
} from '@paperless-dedupe/core';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function buildAuthHeaders(config: App.Locals['config']): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.PAPERLESS_API_TOKEN) {
    headers['Authorization'] = `Token ${config.PAPERLESS_API_TOKEN}`;
  } else if (config.PAPERLESS_USERNAME && config.PAPERLESS_PASSWORD) {
    const encoded = Buffer.from(
      `${config.PAPERLESS_USERNAME}:${config.PAPERLESS_PASSWORD}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }
  return headers;
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (locals.config.PAPERLESS_READ_ONLY) {
    return apiError(ErrorCode.READ_ONLY, { operation: 'delete_document', retryable: false });
  }

  const paperlessId = Number(params.paperlessId);
  if (isNaN(paperlessId) || paperlessId <= 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'Invalid paperless document ID');
  }

  const duplicateMemberMatch = locals.db
    .select({ id: duplicateMember.id, localId: document.id })
    .from(duplicateMember)
    .innerJoin(document, eq(duplicateMember.documentId, document.id))
    .where(eq(document.paperlessId, paperlessId))
    .get();

  if (!duplicateMemberMatch) {
    return apiError(
      ErrorCode.NOT_FOUND,
      'Document is not part of a duplicate group member and cannot be deleted here',
    );
  }

  const config = locals.config;
  const baseUrl = config.PAPERLESS_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/documents/${paperlessId}/`;

  try {
    return await withDuplicateMutationLeaseAsync(locals.db, async () => {
      const upstream = await fetch(url, {
        method: 'DELETE',
        headers: buildAuthHeaders(config),
        signal: AbortSignal.timeout(15000),
      });

      const alreadyMissing = upstream.status === 404;
      if (!upstream.ok && !alreadyMissing) {
        return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
      }

      removeDocumentFromAllGroups(locals.db, duplicateMemberMatch.localId);
      deleteDocumentLocally(locals.db, duplicateMemberMatch.localId);
      if (!alreadyMissing) incrementUsageStats(locals.db, { documentsDeleted: 1 });

      return apiSuccess({ deleted: true, alreadyMissing });
    });
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return apiError(ErrorCode.CONFLICT, {
        operation: 'delete_paperless_duplicate_document',
        retryable: true,
      });
    }
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};
