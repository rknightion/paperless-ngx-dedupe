import { describe, it, expect } from 'vitest';
import { normalizeSuggestedLabel, normalizeSuggestedTags } from '../normalize.js';

describe('normalizeSuggestedLabel', () => {
  it('returns null for null input', () => {
    expect(normalizeSuggestedLabel(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeSuggestedLabel(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeSuggestedLabel('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeSuggestedLabel('   ')).toBeNull();
  });

  it('returns null for "unknown"', () => {
    expect(normalizeSuggestedLabel('unknown')).toBeNull();
  });

  it('returns null for "Unknown" (case-insensitive)', () => {
    expect(normalizeSuggestedLabel('Unknown')).toBeNull();
  });

  it('returns null for " unknown " with whitespace', () => {
    expect(normalizeSuggestedLabel(' unknown ')).toBeNull();
  });

  it('returns null for "UNKNOWN"', () => {
    expect(normalizeSuggestedLabel('UNKNOWN')).toBeNull();
  });

  it('trims valid strings', () => {
    expect(normalizeSuggestedLabel('  Amazon  ')).toBe('Amazon');
  });

  it('preserves valid strings', () => {
    expect(normalizeSuggestedLabel('Amazon')).toBe('Amazon');
  });
});

describe('normalizeSuggestedTags', () => {
  it('returns empty array for null', () => {
    expect(normalizeSuggestedTags(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeSuggestedTags(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(normalizeSuggestedTags([])).toEqual([]);
  });

  it('filters out empty strings', () => {
    expect(normalizeSuggestedTags(['finance', '', '  '])).toEqual(['finance']);
  });

  it('filters out "unknown" tags (case-insensitive)', () => {
    expect(normalizeSuggestedTags(['finance', 'unknown', 'Unknown', 'UNKNOWN'])).toEqual([
      'finance',
    ]);
  });

  it('trims tag values', () => {
    expect(normalizeSuggestedTags(['  finance  ', ' shopping '])).toEqual(['finance', 'shopping']);
  });

  it('deduplicates tags (case-insensitive)', () => {
    expect(normalizeSuggestedTags(['Finance', 'finance', 'FINANCE'])).toEqual(['Finance']);
  });

  it('preserves valid tags', () => {
    expect(normalizeSuggestedTags(['finance', 'shopping', 'invoices'])).toEqual([
      'finance',
      'shopping',
      'invoices',
    ]);
  });
});
