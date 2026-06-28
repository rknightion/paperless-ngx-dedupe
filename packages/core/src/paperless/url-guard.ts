/**
 * SSRF guard for user-supplied Paperless target URLs.
 *
 * The connection-test and config-save flows let a caller supply an arbitrary
 * URL that the server then fetches. Without validation this is a Server-Side
 * Request Forgery oracle. This guard rejects the dangerous vectors while still
 * permitting the normal self-hosted deployment, where Paperless lives on
 * localhost or a private (RFC1918) LAN address — so private ranges are
 * intentionally *not* blocked here.
 */

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Strip IPv6 brackets and lowercase for comparison. */
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * Hosts that are never a legitimate Paperless instance and are classic SSRF
 * pivot targets: the cloud metadata service (link-local 169.254.0.0/16, which
 * includes 169.254.169.254), and the unspecified address.
 */
function isBlockedHost(host: string): boolean {
  if (host === '0.0.0.0' || host === '::') return true;
  // IPv4 link-local 169.254.0.0/16 (cloud metadata endpoint lives here)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // IPv6 link-local fe80::/10
  if (
    host.startsWith('fe80:') ||
    host.startsWith('fe9') ||
    host.startsWith('fea') ||
    host.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

/**
 * Validate a user-supplied Paperless URL before it is used as a fetch target.
 * Returns the parsed URL on success; throws {@link UnsafeUrlError} otherwise.
 */
export function assertSafeTargetUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('The URL is not valid.');
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new UnsafeUrlError(
      `Unsupported URL scheme "${parsed.protocol}". Only http and https are allowed.`,
    );
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new UnsafeUrlError('Embedded credentials in the URL are not allowed.');
  }

  if (isBlockedHost(normalizeHost(parsed.hostname))) {
    throw new UnsafeUrlError('The URL host targets a blocked address range.');
  }

  return parsed;
}
