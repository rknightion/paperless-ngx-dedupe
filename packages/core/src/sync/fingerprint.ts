import { createHash } from 'node:crypto';
import type { PaperlessDocument } from '../paperless/types.js';

/**
 * Compute a change-detection fingerprint for a Paperless document.
 * SHA-256 of canonical metadata, including custom fields.
 * Null byte separator prevents field collision.
 * Tags sorted before hashing for determinism.
 */
export function computeFingerprint(doc: PaperlessDocument): string {
  const sortedTags = [...doc.tags].sort((a, b) => a - b).join(',');
  const sortedCustomFields = [...doc.customFields].sort((a, b) => a.field - b.field);
  const canonical = [
    doc.title,
    doc.content,
    doc.modified,
    sortedTags,
    String(doc.correspondent ?? ''),
    String(doc.documentType ?? ''),
    JSON.stringify(sortedCustomFields),
  ].join('\0');

  return createHash('sha256').update(canonical).digest('hex');
}
