import { createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { type AppConfig } from '@paperless-dedupe/core';

type AccessConfig = Pick<
  AppConfig,
  | 'APP_AUTH_MODE'
  | 'APP_AUTH_USERNAME'
  | 'APP_AUTH_PASSWORD'
  | 'APP_API_TOKEN'
  | 'APP_AUTH_PROXY_HEADER'
  | 'APP_AUTH_TRUSTED_PROXIES'
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
  peerAddress: string,
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
  if (config.APP_AUTH_MODE === 'proxy') {
    const family = isIP(peerAddress);
    const trusted = new BlockList();
    for (const entry of config.APP_AUTH_TRUSTED_PROXIES!.split(',')) {
      const [address, prefix] = entry.trim().split('/');
      trusted.addSubnet(address, Number(prefix), isIP(address) === 4 ? 'ipv4' : 'ipv6');
    }
    if (
      family &&
      trusted.check(peerAddress, family === 4 ? 'ipv4' : 'ipv6') &&
      headers.get(config.APP_AUTH_PROXY_HEADER)?.trim()
    )
      return { allowed: true };
    return { allowed: false, reason: 'credentials_required' };
  }
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
