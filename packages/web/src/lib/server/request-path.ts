/**
 * The decoded path SvelteKit routes on. `event.url` keeps the raw percent-encoding, so a guard
 * that reads it directly can disagree with the route that actually runs.
 */
export function routedPathname(pathname: string): string {
  try {
    return pathname.split('%25').map(decodeURI).join('%25');
  } catch {
    return pathname;
  }
}

export function isApiRequest(event: { url: URL; route: { id: string | null } }): boolean {
  return (
    Boolean(event.route.id?.startsWith('/api/')) ||
    routedPathname(event.url.pathname).startsWith('/api/')
  );
}
