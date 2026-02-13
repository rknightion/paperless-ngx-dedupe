import { describe, it, expect } from 'vitest';
import { parseTagsJson } from '../helpers.js';

describe('parseTagsJson', () => {
  it('parses a valid JSON array of strings', () => {
    expect(parseTagsJson('["tag1","tag2"]')).toEqual(['tag1', 'tag2']);
  });

  it('returns empty array for null', () => {
    expect(parseTagsJson(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTagsJson('')).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseTagsJson('{not json')).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseTagsJson('"hello"')).toEqual([]);
  });

  it('converts non-string array elements to strings', () => {
    expect(parseTagsJson('[1, 2, 3]')).toEqual(['1', '2', '3']);
  });
});
