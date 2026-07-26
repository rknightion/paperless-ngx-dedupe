import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { apiError, ErrorCode } from '$lib/server/api';

type PaperlessMediaAssetKind = 'thumb' | 'preview';

interface PaperlessMediaAuthorization {
  paperlessId: number;
  assetKind: PaperlessMediaAssetKind;
  now?: number;
}

const MEDIA_ACCESS_TTL_MS = 60 * 60 * 1000;
const fallbackMediaSigningKey = randomBytes(32);

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

function getMediaSigningKey(config: App.Locals['config']): string | Buffer {
  return getPaperlessAuthorization(config) ?? fallbackMediaSigningKey;
}

function signMediaAccess(
  config: App.Locals['config'],
  paperlessId: number,
  assetKind: PaperlessMediaAssetKind,
  expiresAt: number,
): string {
  return createHmac('sha256', getMediaSigningKey(config))
    .update(`${paperlessId}:${assetKind}:${expiresAt}`)
    .digest('base64url');
}

function hasValidMediaAccess(
  request: Request,
  config: App.Locals['config'],
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
    config,
    authorization.paperlessId,
    authorization.assetKind,
    expiresAt,
  );

  return timingSafeEqual(
    Buffer.from(providedSignature, 'base64url'),
    Buffer.from(expectedSignature, 'base64url'),
  );
}

export function buildPaperlessAuthHeaders(config: App.Locals['config']): Record<string, string> {
  const authorization = getPaperlessAuthorization(config);
  if (!authorization) {
    return {};
  }

  return { Authorization: authorization };
}

export function createPaperlessMediaUrl(
  config: App.Locals['config'],
  paperlessId: number,
  assetKind: PaperlessMediaAssetKind,
  now = Date.now(),
): string {
  const expiresAt = now + MEDIA_ACCESS_TTL_MS;
  const signature = signMediaAccess(config, paperlessId, assetKind, expiresAt);
  return `/api/v1/paperless/documents/${paperlessId}/${assetKind}?access=${expiresAt}.${signature}`;
}

export function requirePaperlessAuthorization(
  request: Request,
  config: App.Locals['config'],
  mediaAuthorization?: PaperlessMediaAuthorization,
) {
  const expected = getPaperlessAuthorization(config);
  const provided = request.headers.get('authorization');

  if (expected && provided?.trim() === expected) {
    return null;
  }

  if (mediaAuthorization && hasValidMediaAccess(request, config, mediaAuthorization)) {
    return null;
  }

  return apiError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
}
