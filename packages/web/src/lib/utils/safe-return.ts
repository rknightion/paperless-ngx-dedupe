const LOCAL_ORIGIN = 'http://paperless-dedupe.local';

export function safeDocumentReturnTarget(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }

  try {
    const target = new URL(value, LOCAL_ORIGIN);
    if (target.origin !== LOCAL_ORIGIN || target.pathname !== '/documents') return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}
