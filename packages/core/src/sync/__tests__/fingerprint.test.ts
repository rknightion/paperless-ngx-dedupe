import { describe, it, expect } from 'vitest';
import { computeFingerprint } from '../fingerprint.js';
import type { PaperlessDocument } from '../../paperless/types.js';

function makeDoc(overrides?: Partial<PaperlessDocument>): PaperlessDocument {
  return {
    id: 1,
    title: 'Test Document',
    content: 'Some content here',
    tags: [1, 2, 3],
    correspondent: 10,
    documentType: 5,
    created: '2024-01-01T00:00:00Z',
    modified: '2024-01-02T00:00:00Z',
    added: '2024-01-01T00:00:00Z',
    originalFileName: 'test.pdf',
    archivedFileName: null,
    archiveSerialNumber: null,
    ...overrides,
  };
}

describe('computeFingerprint', () => {
  it('should return a hex SHA-256 hash', () => {
    const fp = computeFingerprint(makeDoc());
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce same fingerprint for identical docs', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc());
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprint when title changes', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ title: 'Different Title' }));
    expect(fp1).not.toBe(fp2);
  });

  it('should produce different fingerprint when content changes', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ content: 'Different content' }));
    expect(fp1).not.toBe(fp2);
  });

  it('should produce different fingerprint when modified date changes', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ modified: '2024-06-01T00:00:00Z' }));
    expect(fp1).not.toBe(fp2);
  });

  it('should produce different fingerprint when tags change', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ tags: [1, 2, 4] }));
    expect(fp1).not.toBe(fp2);
  });

  it('should produce same fingerprint regardless of tag order', () => {
    const fp1 = computeFingerprint(makeDoc({ tags: [3, 1, 2] }));
    const fp2 = computeFingerprint(makeDoc({ tags: [1, 2, 3] }));
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprint when correspondent changes', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ correspondent: 20 }));
    expect(fp1).not.toBe(fp2);
  });

  it('should handle null correspondent', () => {
    const fp1 = computeFingerprint(makeDoc({ correspondent: null }));
    const fp2 = computeFingerprint(makeDoc({ correspondent: null }));
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprint when documentType changes', () => {
    const fp1 = computeFingerprint(makeDoc());
    const fp2 = computeFingerprint(makeDoc({ documentType: 99 }));
    expect(fp1).not.toBe(fp2);
  });
});
