import { describe, it, expect } from 'vitest';
import {
  parseRateLimitHeaders,
  parseResetDuration,
  parseRetryAfterMs,
} from '../providers/openai.js';

describe('parseResetDuration', () => {
  it('parses milliseconds ("6ms")', () => {
    expect(parseResetDuration('6ms')).toBe(6);
  });

  it('parses seconds ("1s")', () => {
    expect(parseResetDuration('1s')).toBe(1000);
  });

  it('parses fractional seconds ("1.5s")', () => {
    expect(parseResetDuration('1.5s')).toBe(1500);
  });

  it('parses combined minutes and seconds ("1m30s")', () => {
    expect(parseResetDuration('1m30s')).toBe(90_000);
  });

  it('parses minutes only ("2m")', () => {
    expect(parseResetDuration('2m')).toBe(120_000);
  });

  it('returns null for empty string', () => {
    expect(parseResetDuration('')).toBeNull();
  });

  it('returns null for unparseable value', () => {
    expect(parseResetDuration('foo')).toBeNull();
  });
});

describe('parseRetryAfterMs', () => {
  it('parses float seconds to ms', () => {
    expect(parseRetryAfterMs('0.049')).toBe(49);
  });

  it('parses whole seconds to ms', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
  });

  it('returns 5000 (default) for null', () => {
    expect(parseRetryAfterMs(null)).toBe(5000);
  });

  it('returns 5000 (default) for unparseable value', () => {
    expect(parseRetryAfterMs('not-a-number')).toBe(5000);
  });
});

describe('parseRateLimitHeaders', () => {
  it('parses all three headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': '4000000',
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    const result = parseRateLimitHeaders(headers);
    expect(result).toEqual({
      limitTokens: 4_000_000,
      remainingTokens: 3_500_000,
      resetTokensMs: 6,
    });
  });

  it('returns undefined when limit-tokens header is missing', () => {
    const headers = new Headers({
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when remaining-tokens header is missing', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': '4000000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });

  it('returns undefined when headers have non-numeric values', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': 'abc',
      'x-ratelimit-remaining-tokens': '3500000',
      'x-ratelimit-reset-tokens': '6ms',
    });
    expect(parseRateLimitHeaders(headers)).toBeUndefined();
  });
});
