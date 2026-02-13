import { createHash } from 'node:crypto';
import type { PaperlessDocument } from '../paperless/types.js';

/**
 * Compute a change-detection fingerprint for a Paperless document.
 * SHA-256 of canonical string: title\0content\0modified\0sortedTags\0correspondent\0documentType
 * Null byte separator prevents field collision.
 * Tags sorted before hashing for determinism.
 */
export function computeFingerprint(doc: PaperlessDocument): string {
  const sortedTags = [...doc.tags].sort((a, b) => a - b).join(',');
  const canonical = [
    doc.title,
    doc.content,
    doc.modified,
    sortedTags,
    String(doc.correspondent ?? ''),
    String(doc.documentType ?? ''),
  ].join('\0');

  return createHash('sha256').update(canonical).digest('hex');
}
