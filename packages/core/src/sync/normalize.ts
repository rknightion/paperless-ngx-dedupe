import { createHash } from 'node:crypto';

export interface NormalizedResult {
  normalizedText: string;
  wordCount: number;
  contentHash: string;
}

export function normalizeText(text: string): NormalizedResult {
  // Lowercase -> collapse whitespace -> trim
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Word count: split on spaces, filter empty
  const wordCount = normalizedText === '' ? 0 : normalizedText.split(' ').length;

  // SHA-256 content hash
  const contentHash = createHash('sha256').update(normalizedText).digest('hex');

  return { normalizedText, wordCount, contentHash };
}
