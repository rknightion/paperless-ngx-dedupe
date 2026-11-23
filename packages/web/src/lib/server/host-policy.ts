import { isIP } from 'node:net';

// Names a public DNS response cannot be issued for, so DNS rebinding cannot present them.
const PRIVATE_NAME_SUFFIXES = [
  '.local',
  '.localhost',
  '.lan',
  '.internal',
  '.intranet',
  '.home',
  '.home.arpa',
];

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function isPrivateStyleName(hostname: string): boolean {
  return (
    isIP(hostname.replace(/^\[|\]$/g, '')) !== 0 ||
    !hostname.includes('.') ||
    PRIVATE_NAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/**
 * Refuses a Host header naming a public domain the operator has not configured. Without this a
 * malicious site can rebind its own name to this server and read it as same-origin.
 */
export function isAllowedHost(
  host: string | null,
  { origin, allowedHosts }: { origin?: string; allowedHosts?: string },
): boolean {
  const hostname = host ? hostnameOf(host) : null;
  if (!hostname) return false;
  const configured = (allowedHosts ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (configured.includes('*') || configured.includes(hostname)) return true;
  if (origin && hostnameOf(new URL(origin).host) === hostname) return true;
  return isPrivateStyleName(hostname);
}

/** Compares by host so plain HTTP still matches when the adapter assumes an https URL. */
export function isSameHostOrigin(origin: string, host: string | null): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
