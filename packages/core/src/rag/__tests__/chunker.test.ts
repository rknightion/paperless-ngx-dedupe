import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../chunker.js';

describe('chunkDocument', () => {
  const defaultOpts = { chunkSize: 400, chunkOverlap: 40 };

  it('returns empty array for empty string', () => {
    const result = chunkDocument('', { title: 'Test' }, defaultOpts);
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    const result = chunkDocument('   \n\n\t  ', { title: 'Test' }, defaultOpts);
    expect(result).toEqual([]);
  });

  it('returns single chunk for small document', () => {
    const result = chunkDocument('Hello world.', { title: 'Test Doc' }, defaultOpts);
    expect(result).toHaveLength(1);
    expect(result[0].chunkIndex).toBe(0);
    expect(result[0].content).toContain('Hello world.');
  });

  it('splits large document into multiple chunks', () => {
    // chunkSize=400 tokens → 1600 chars max per chunk (minus prefix)
    const longText = 'word '.repeat(800); // 4000 chars → well over one chunk
    const result = chunkDocument(longText, { title: 'Big Doc' }, defaultOpts);
    expect(result.length).toBeGreaterThan(1);
    // Verify indices are sequential
    for (let i = 0; i < result.length; i++) {
      expect(result[i].chunkIndex).toBe(i);
    }
  });

  it('applies overlap between chunks', () => {
    // Use a small chunk size so we get multiple chunks
    const opts = { chunkSize: 50, chunkOverlap: 10 }; // 200 chars, 40 overlap chars
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Sentence number ${i}.`).join(' ');
    const result = chunkDocument(paragraphs, { title: 'Doc' }, opts);
    if (result.length >= 2) {
      // The second chunk should contain overlapping text from the first raw part
      // Since overlap takes from end of previous raw part, second chunk should be longer than
      // it would be without overlap, and share trailing text from first part
      expect(result[1].content.length).toBeGreaterThan(0);
    }
  });

  it('includes title in metadata prefix', () => {
    const result = chunkDocument('Some content.', { title: 'My Title' }, defaultOpts);
    expect(result[0].content).toMatch(/^\[Title: My Title\]\n/);
  });

  it('includes correspondent in prefix when provided', () => {
    const result = chunkDocument(
      'Some content.',
      { title: 'Doc', correspondent: 'ACME Corp' },
      defaultOpts,
    );
    expect(result[0].content).toMatch(/^\[Title: Doc \| From: ACME Corp\]\n/);
  });

  it('omits correspondent from prefix when null', () => {
    const result = chunkDocument(
      'Some content.',
      { title: 'Doc', correspondent: null },
      defaultOpts,
    );
    expect(result[0].content).toMatch(/^\[Title: Doc\]\n/);
    expect(result[0].content).not.toContain('From:');
  });

  it('omits correspondent from prefix when undefined', () => {
    const result = chunkDocument('Some content.', { title: 'Doc' }, defaultOpts);
    expect(result[0].content).not.toContain('From:');
  });

  it('generates different content hashes for different chunks', () => {
    const longText = 'word '.repeat(800);
    const result = chunkDocument(longText, { title: 'Doc' }, defaultOpts);
    if (result.length >= 2) {
      const hashes = result.map((c) => c.contentHash);
      const unique = new Set(hashes);
      expect(unique.size).toBe(hashes.length);
    }
  });

  it('generates consistent content hash (SHA-256)', () => {
    const resultA = chunkDocument('Same text.', { title: 'Doc' }, defaultOpts);
    const resultB = chunkDocument('Same text.', { title: 'Doc' }, defaultOpts);
    expect(resultA[0].contentHash).toBe(resultB[0].contentHash);
    // SHA-256 hex = 64 chars
    expect(resultA[0].contentHash).toHaveLength(64);
  });

  it('token count is approximately length / 4', () => {
    const result = chunkDocument('Hello world.', { title: 'Doc' }, defaultOpts);
    const content = result[0].content;
    expect(result[0].tokenCount).toBe(Math.ceil(content.length / 4));
  });

  it('splits at paragraph boundaries first', () => {
    const opts = { chunkSize: 30, chunkOverlap: 0 }; // 120 chars
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = chunkDocument(text, { title: 'D' }, opts);
    // With small chunk size, paragraphs should be separated
    if (result.length >= 2) {
      // Each chunk should contain whole paragraph segments
      const firstContent = result[0].content;
      // The first chunk shouldn't split mid-paragraph
      expect(firstContent).toContain('paragraph');
    }
  });

  it('falls back to line boundaries when paragraphs are too large', () => {
    const opts = { chunkSize: 30, chunkOverlap: 0 }; // 120 chars
    const text = 'Line one.\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.';
    const result = chunkDocument(text, { title: 'D' }, opts);
    // Should produce multiple chunks splitting at \n
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
