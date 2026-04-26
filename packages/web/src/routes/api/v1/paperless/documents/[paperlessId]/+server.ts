import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { document, duplicateMember } from '@paperless-dedupe/core';
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
  const paperlessId = Number(params.paperlessId);
  if (isNaN(paperlessId) || paperlessId <= 0) {
    return apiError(ErrorCode.BAD_REQUEST, 'Invalid paperless document ID');
  }

  const duplicateMemberMatch = locals.db
    .select({ id: duplicateMember.id })
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
    const upstream = await fetch(url, {
      method: 'DELETE',
      headers: buildAuthHeaders(config),
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return apiError(ErrorCode.BAD_GATEWAY, `Paperless returned ${upstream.status}`);
    }

    return apiSuccess({ deleted: true });
  } catch {
    return apiError(ErrorCode.BAD_GATEWAY, 'Failed to connect to Paperless-NGX');
  }
};
