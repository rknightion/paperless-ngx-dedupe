import { describe, it, expect } from 'vitest';
import { fnv1a32, textToShingles } from '../shingles.js';

describe('fnv1a32', () => {
  it('returns deterministic output for the same input', () => {
    const hash1 = fnv1a32('hello world');
    const hash2 = fnv1a32('hello world');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = fnv1a32('hello');
    const hash2 = fnv1a32('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = fnv1a32('test');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it('handles empty string', () => {
    const hash = fnv1a32('');
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

describe('textToShingles', () => {
  const twentyWords = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
  const tenWords = Array.from({ length: 10 }, (_, i) => `word${i}`).join(' ');

  it('returns null for fewer than minWords', () => {
    expect(textToShingles(tenWords)).toBeNull();
  });

  it('returns null for fewer than custom minWords', () => {
    expect(textToShingles(twentyWords, 3, 25)).toBeNull();
  });

  it('returns a Set of numbers for sufficient words', () => {
    const result = textToShingles(twentyWords);
    expect(result).toBeInstanceOf(Set);
    expect(result!.size).toBeGreaterThan(0);
  });

  it('produces correct number of n-grams', () => {
    // 20 words with ngramSize=3 → 20-3+1 = 18 shingles (assuming no hash collisions)
    const result = textToShingles(twentyWords, 3, 20);
    expect(result).not.toBeNull();
    expect(result!.size).toBeLessThanOrEqual(18);
    expect(result!.size).toBeGreaterThan(0);
  });

  it('respects custom ngramSize', () => {
    // 20 words with ngramSize=5 → 20-5+1 = 16 shingles max
    const result = textToShingles(twentyWords, 5, 20);
    expect(result).not.toBeNull();
    expect(result!.size).toBeLessThanOrEqual(16);
  });

  it('returns deterministic results', () => {
    const result1 = textToShingles(twentyWords);
    const result2 = textToShingles(twentyWords);
    expect([...result1!].sort()).toEqual([...result2!].sort());
  });

  it('handles text with extra whitespace', () => {
    const text = Array.from({ length: 20 }, (_, i) => `word${i}`).join('   ');
    const result = textToShingles(text);
    expect(result).not.toBeNull();
  });
});
