/**
 * Normalize a suggested label (correspondent or document type).
 * Maps null, empty, whitespace-only, and "unknown" variants to null.
 */
export function normalizeSuggestedLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.toLowerCase() === 'unknown') return null;
  return cleaned;
}

/**
 * Normalize suggested tags.
 * Trims, removes empty/unknown entries, deduplicates (case-insensitive).
 */
export function normalizeSuggestedTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim();
    if (!cleaned) continue;
    if (cleaned.toLowerCase() === 'unknown') continue;
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(cleaned);
  }
  return result;
}
