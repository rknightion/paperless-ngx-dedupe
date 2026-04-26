import { apiError, ErrorCode } from '$lib/server/api';

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

export function buildPaperlessAuthHeaders(config: App.Locals['config']): Record<string, string> {
  const authorization = getPaperlessAuthorization(config);
  if (!authorization) {
    return {};
  }

  return { Authorization: authorization };
}

export function requirePaperlessAuthorization(
  request: Request,
  config: App.Locals['config'],
) {
  const expected = getPaperlessAuthorization(config);
  const provided = request.headers.get('authorization');

  if (!expected || !provided || provided.trim() !== expected) {
    return apiError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
  }

  return null;
}
