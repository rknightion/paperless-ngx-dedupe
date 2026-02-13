/**
 * Safely parse a JSON string representing a tags array.
 * Returns an empty array for null, empty, or malformed input.
 */
export function parseTagsJson(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String);
  } catch {
    return [];
  }
}
