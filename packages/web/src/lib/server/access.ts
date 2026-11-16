import { createHash, timingSafeEqual } from 'node:crypto';
import { type AppConfig } from '@paperless-dedupe/core';

type AccessConfig = Pick<
  AppConfig,
  'APP_AUTH_MODE' | 'APP_AUTH_USERNAME' | 'APP_AUTH_PASSWORD' | 'APP_API_TOKEN'
>;
type AccessDecision =
  { allowed: true } | { allowed: false; reason: 'credentials_required' | 'invalid_credentials' };

function matches(actual: string | Uint8Array, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

/** Decide access without requests, sessions or exposing configured credentials in the result. */
export function decideAccess(
  config: AccessConfig,
  method: string,
  path: string,
  headers: Headers,
  _peerAddress: string,
): AccessDecision {
  if (
    method === 'OPTIONS' ||
    (method === 'GET' && ['/api/v1/health', '/api/v1/ready'].includes(path))
  )
    return { allowed: true };
  const authorization = headers.get('authorization');
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (
    path.startsWith('/api/v1/') &&
    config.APP_API_TOKEN &&
    /^Bearer(?:\s|$)/i.test(authorization ?? '')
  ) {
    return bearer && matches(bearer[1], config.APP_API_TOKEN)
      ? { allowed: true }
      : { allowed: false, reason: 'invalid_credentials' };
  }
  if (config.APP_AUTH_MODE === 'none') return { allowed: true };
  const basic = authorization?.match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
  if (
    basic &&
    matches(
      Buffer.from(basic[1], 'base64'),
      `${config.APP_AUTH_USERNAME}:${config.APP_AUTH_PASSWORD}`,
    )
  )
    return { allowed: true };
  return { allowed: false, reason: authorization ? 'invalid_credentials' : 'credentials_required' };
}
