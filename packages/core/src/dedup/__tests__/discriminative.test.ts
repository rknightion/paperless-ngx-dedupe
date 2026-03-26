import { describe, it, expect } from 'vitest';
import { extractDiscriminativeTokens, computeDiscriminativeScore } from '../discriminative.js';

describe('extractDiscriminativeTokens', () => {
  it('extracts dates in numeric formats', () => {
    const tokens = extractDiscriminativeTokens('statement date 01/15/2024 due date 02/15/2024');
    expect(tokens.dates.size).toBe(2);
    expect(tokens.dates.has('01152024')).toBe(true);
    expect(tokens.dates.has('02152024')).toBe(true);
  });

  it('extracts dates with dash separators', () => {
    const tokens = extractDiscriminativeTokens('date: 15-01-2024');
    expect(tokens.dates.size).toBe(1);
    expect(tokens.dates.has('15012024')).toBe(true);
  });

  it('extracts ISO format dates', () => {
    const tokens = extractDiscriminativeTokens('created 2024-01-15');
    expect(tokens.dates.size).toBe(1);
    expect(tokens.dates.has('20240115')).toBe(true);
  });

  it('extracts month-name dates', () => {
    const tokens = extractDiscriminativeTokens('january 15, 2024 and december 3, 2023');
    expect(tokens.dates.size).toBe(2);
  });

  it('extracts monetary amounts with currency symbols', () => {
    const tokens = extractDiscriminativeTokens('total: $1,234.56 balance: $500.00');
    expect(tokens.amounts.size).toBe(2);
    expect(tokens.amounts.has('1234.56')).toBe(true);
    expect(tokens.amounts.has('500.00')).toBe(true);
  });

  it('extracts monetary amounts with currency codes', () => {
    const tokens = extractDiscriminativeTokens('amount 1234.56 usd');
    expect(tokens.amounts.size).toBe(1);
    expect(tokens.amounts.has('1234.56')).toBe(true);
  });

  it('extracts standalone comma-formatted decimals', () => {
    const tokens = extractDiscriminativeTokens('balance 2,500.00 remaining');
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
  });

  it('extracts reference numbers (6+ digits)', () => {
    const tokens = extractDiscriminativeTokens('account 123456789 ref 987654');
    expect(tokens.references.size).toBe(2);
    expect(tokens.references.has('123456789')).toBe(true);
    expect(tokens.references.has('987654')).toBe(true);
  });

  it('does not extract short numbers as references', () => {
    const tokens = extractDiscriminativeTokens('page 42 of 100');
    expect(tokens.references.size).toBe(0);
  });

  it('returns empty sets for text with no structured data', () => {
    const tokens = extractDiscriminativeTokens('the quick brown fox jumps over the lazy dog');
    expect(tokens.total).toBe(0);
    expect(tokens.dates.size).toBe(0);
    expect(tokens.amounts.size).toBe(0);
    expect(tokens.references.size).toBe(0);
  });

  it('extracts multiple token types from mixed content', () => {
    const tokens = extractDiscriminativeTokens(
      'statement 01/15/2024 account 123456789 balance $1,234.56',
    );
    expect(tokens.dates.size).toBeGreaterThanOrEqual(1);
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
    expect(tokens.references.size).toBeGreaterThanOrEqual(1);
    expect(tokens.total).toBeGreaterThanOrEqual(3);
  });
});

describe('computeDiscriminativeScore', () => {
  it('returns 1.0 when both texts have no discriminative tokens', () => {
    const score = computeDiscriminativeScore(
      'the quick brown fox jumps over the lazy dog',
      'a different sentence with no numbers or dates',
    );
    expect(score).toBe(1.0);
  });

  it('returns 0.5 when only one text has tokens', () => {
    const score = computeDiscriminativeScore(
      'statement date 01/15/2024 total $500.00',
      'the quick brown fox jumps over the lazy dog',
    );
    expect(score).toBe(0.5);
  });

  it('returns 1.0 for identical structured content', () => {
    const text = 'statement 01/15/2024 account 123456789 balance $1,234.56';
    const score = computeDiscriminativeScore(text, text);
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for completely different structured content', () => {
    const text1 = 'statement 01/15/2024 balance $1,234.56 account 111111';
    const text2 = 'statement 06/30/2025 balance $9,876.54 account 222222';
    const score = computeDiscriminativeScore(text1, text2);
    expect(score).toBe(0.0);
  });

  it('returns partial score for overlapping structured content', () => {
    const text1 = 'statement 01/15/2024 account 123456789 balance $1,234.56';
    const text2 = 'statement 01/15/2024 account 123456789 balance $2,345.67';
    const score = computeDiscriminativeScore(text1, text2);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  describe('real-world scenarios', () => {
    const bankStatementTemplate = (month: string, date: string, amounts: string[]) =>
      `acme bank monthly statement ${month} account number 1234567890 ` +
      `statement date ${date} ` +
      `opening balance ${amounts[0]} ` +
      `transaction grocery store ${amounts[1]} ` +
      `transaction gas station ${amounts[2]} ` +
      `closing balance ${amounts[3]} ` +
      `minimum payment due ${amounts[4]}`;

    it('scores low for same-template different-month bank statements', () => {
      const jan = bankStatementTemplate('january 2024', '01/31/2024', [
        '$5,000.00',
        '$150.00',
        '$45.00',
        '$4,805.00',
        '$25.00',
      ]);
      const feb = bankStatementTemplate('february 2024', '02/28/2024', [
        '$4,805.00',
        '$200.00',
        '$60.00',
        '$4,545.00',
        '$30.00',
      ]);
      const score = computeDiscriminativeScore(jan, feb);
      expect(score).toBeLessThan(0.5);
    });

    it('scores high for true duplicate (identical content)', () => {
      const statement = bankStatementTemplate('january 2024', '01/31/2024', [
        '$5,000.00',
        '$150.00',
        '$45.00',
        '$4,805.00',
        '$25.00',
      ]);
      const score = computeDiscriminativeScore(statement, statement);
      expect(score).toBe(1.0);
    });
  });
});
