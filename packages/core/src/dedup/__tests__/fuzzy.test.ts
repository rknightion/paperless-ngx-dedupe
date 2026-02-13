import { describe, it, expect } from 'vitest';
import { tokenSortRatio, sampleText } from '../fuzzy.js';

describe('tokenSortRatio', () => {
  it('returns 1.0 for identical strings', () => {
    expect(tokenSortRatio('hello world', 'hello world')).toBe(1.0);
  });

  it('returns 1.0 for reordered words', () => {
    expect(tokenSortRatio('hello world foo', 'foo hello world')).toBe(1.0);
  });

  it('returns 1.0 for both empty strings', () => {
    expect(tokenSortRatio('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(tokenSortRatio('hello', '')).toBe(0.0);
    expect(tokenSortRatio('', 'world')).toBe(0.0);
  });

  it('returns a value between 0 and 1 for partially similar strings', () => {
    const ratio = tokenSortRatio('the quick brown fox', 'the slow brown dog');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });

  it('handles strings with extra whitespace', () => {
    expect(tokenSortRatio('  hello   world  ', 'world hello')).toBe(1.0);
  });
});

describe('sampleText', () => {
  it('returns full text when shorter than maxChars', () => {
    expect(sampleText('short text')).toBe('short text');
  });

  it('truncates text to maxChars', () => {
    const long = 'a'.repeat(10000);
    const sampled = sampleText(long, 5000);
    expect(sampled.length).toBe(5000);
  });

  it('uses default maxChars of 5000', () => {
    const long = 'b'.repeat(10000);
    const sampled = sampleText(long);
    expect(sampled.length).toBe(5000);
  });

  it('respects custom maxChars', () => {
    const text = 'a'.repeat(200);
    expect(sampleText(text, 50).length).toBe(50);
  });
});
