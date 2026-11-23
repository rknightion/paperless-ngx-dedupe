import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { apiError, ErrorCode } from '$lib/server/api';

type PaperlessMediaAssetKind = 'thumb' | 'preview';

interface PaperlessMediaAuthorization {
  paperlessId: number;
  assetKind: PaperlessMediaAssetKind;
  now?: number;
}

const MEDIA_ACCESS_TTL_MS = 60 * 60 * 1000;
// A restart invalidates outstanding media URLs; reloading the page issues fresh links.
const mediaSigningKey = randomBytes(32);

function getPaperlessAuthorization(config: App.Locals['config']): string | null {
  if (config.PAPERLESS_API_TOKEN) {
    return `Token ${config.PAPERLESS_API_TOKEN}`;
  }

  if (config.PAPERLESS_USERNAME && config.PAPERLESS_PASSWORD) {
    const encoded = Buffer.from(
      `${config.PAPERLESS_USERNAME}:${config.PAPERLESS_PASSWORD}`,
    ).toString('base64');
    return `Basic ${encoded}`;
  }

  return null;
}

function signMediaAccess(
  paperlessId: number,
  assetKind: PaperlessMediaAssetKind,
  expiresAt: number,
): string {
  return createHmac('sha256', mediaSigningKey)
    .update(`${paperlessId}:${assetKind}:${expiresAt}`)
    .digest('base64url');
}

function hasValidMediaAccess(
  request: Request,
  authorization: PaperlessMediaAuthorization,
): boolean {
  const access = new URL(request.url).searchParams.get('access');
  if (!access) {
    return false;
  }

  const [expiresAtText, providedSignature, ...extra] = access.split('.');
  if (
    extra.length > 0 ||
    !expiresAtText ||
    !/^\d+$/.test(expiresAtText) ||
    !providedSignature ||
    !/^[A-Za-z0-9_-]{43}$/.test(providedSignature)
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  const now = authorization.now ?? Date.now();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return false;
  }

  const expectedSignature = signMediaAccess(
    authorization.paperlessId,
    authorization.assetKind,
    expiresAt,
  );

  return timingSafeEqual(
    Buffer.from(providedSignature, 'base64url'),
    Buffer.from(expectedSignature, 'base64url'),
  );
}

/**
 * Browsers set this header themselves, so another site's page cannot claim it. Lists render images
 * from a bare document id, and the application's access check has already run by this point.
 */
function isSameOriginBrowserRequest(request: Request): boolean {
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export function buildPaperlessAuthHeaders(config: App.Locals['config']): Record<string, string> {
  const authorization = getPaperlessAuthorization(config);
  if (!authorization) {
    return {};
  }

  return { Authorization: authorization };
}

export function createPaperlessMediaUrl(
  paperlessId: number,
  assetKind: PaperlessMediaAssetKind,
  now = Date.now(),
): string {
  const expiresAt = now + MEDIA_ACCESS_TTL_MS;
  const signature = signMediaAccess(paperlessId, assetKind, expiresAt);
  return `/api/v1/paperless/documents/${paperlessId}/${assetKind}?access=${expiresAt}.${signature}`;
}

export function requirePaperlessAuthorization(
  request: Request,
  config: App.Locals['config'],
  mediaAuthorization?: PaperlessMediaAuthorization,
) {
  const expected = getPaperlessAuthorization(config);
  const provided = request.headers.get('authorization');

  if (
    expected &&
    provided !== null &&
    timingSafeEqual(
      createHash('sha256').update(provided.trim()).digest(),
      createHash('sha256').update(expected).digest(),
    )
  ) {
    return null;
  }

  if (
    mediaAuthorization &&
    (isSameOriginBrowserRequest(request) || hasValidMediaAccess(request, mediaAuthorization))
  ) {
    return null;
  }

  return apiError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
}
