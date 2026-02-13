import { describe, it, expect } from 'vitest';
import { normalizeText } from '../normalize.js';

describe('normalizeText', () => {
  it('should lowercase text', () => {
    const result = normalizeText('Hello WORLD');
    expect(result.normalizedText).toBe('hello world');
  });

  it('should collapse whitespace', () => {
    const result = normalizeText('hello   world\n\nfoo\tbar');
    expect(result.normalizedText).toBe('hello world foo bar');
  });

  it('should trim whitespace', () => {
    const result = normalizeText('  hello world  ');
    expect(result.normalizedText).toBe('hello world');
  });

  it('should handle empty string', () => {
    const result = normalizeText('');
    expect(result.normalizedText).toBe('');
    expect(result.wordCount).toBe(0);
  });

  it('should handle whitespace-only string', () => {
    const result = normalizeText('   \n\t  ');
    expect(result.normalizedText).toBe('');
    expect(result.wordCount).toBe(0);
  });

  it('should count words correctly', () => {
    const result = normalizeText('one two three four five');
    expect(result.wordCount).toBe(5);
  });

  it('should produce deterministic content hash', () => {
    const r1 = normalizeText('hello world');
    const r2 = normalizeText('hello world');
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  it('should produce different hash for different text', () => {
    const r1 = normalizeText('hello world');
    const r2 = normalizeText('goodbye world');
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });

  it('should produce a hex SHA-256 hash (64 characters)', () => {
    const result = normalizeText('test');
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should handle unicode', () => {
    const result = normalizeText('ÜBER Straße CAFÉ');
    expect(result.normalizedText).toBe('über straße café');
  });
});
