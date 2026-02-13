/**
 * FNV-1a 32-bit hash and word n-gram shingle generation.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a32(str: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function textToShingles(text: string, ngramSize = 3, minWords = 20): Set<number> | null {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < minWords) {
    return null;
  }

  const shingles = new Set<number>();
  const limit = words.length - ngramSize + 1;
  for (let i = 0; i < limit; i++) {
    const ngram = words.slice(i, i + ngramSize).join(' ');
    shingles.add(fnv1a32(ngram));
  }
  return shingles;
}
