import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getDocumentContent, duplicateMember } from '@paperless-dedupe/core';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const groupId = params.id;
  const docA = url.searchParams.get('docA');
  const docB = url.searchParams.get('docB');

  if (!docA || !docB) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Both docA and docB query parameters are required',
    );
  }

  const db = locals.db;

  // Validate both docs are members of this group
  const members = db
    .select({ documentId: duplicateMember.documentId })
    .from(duplicateMember)
    .where(eq(duplicateMember.groupId, groupId))
    .all();

  const memberDocIds = new Set(members.map((m) => m.documentId));
  if (!memberDocIds.has(docA) || !memberDocIds.has(docB)) {
    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'One or both documents are not members of this group',
    );
  }

  const contentA = getDocumentContent(db, docA);
  const contentB = getDocumentContent(db, docB);

  return apiSuccess({
    docA: contentA ?? { fullText: null, wordCount: null },
    docB: contentB ?? { fullText: null, wordCount: null },
  });
};
