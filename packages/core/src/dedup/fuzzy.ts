/**
 * Fuzzy text matching using token-sort Levenshtein ratio.
 */

import { distance } from 'fastest-levenshtein';

export function sampleText(text: string, maxChars = 5000): string {
  return text.slice(0, maxChars);
}

export function tokenSortRatio(text1: string, text2: string): number {
  const sorted1 = text1
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .sort()
    .join(' ');
  const sorted2 = text2
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .sort()
    .join(' ');

  if (sorted1.length === 0 && sorted2.length === 0) {
    return 1.0;
  }
  if (sorted1.length === 0 || sorted2.length === 0) {
    return 0.0;
  }

  const maxLen = Math.max(sorted1.length, sorted2.length);
  return 1 - distance(sorted1, sorted2) / maxLen;
}
