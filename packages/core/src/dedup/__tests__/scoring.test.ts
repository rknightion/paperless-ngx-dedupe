import { describe, it, expect } from 'vitest';
import { computeSimilarityScore } from '../scoring.js';
import type { DocumentScoringData, SimilarityWeights } from '../types.js';

const defaultWeights: SimilarityWeights = {
  jaccard: 60,
  fuzzy: 40,
  discriminativePenaltyStrength: 50,
};

function makeDoc(overrides: Partial<DocumentScoringData> = {}): DocumentScoringData {
  return {
    id: 'doc1',
    title: 'Test Document',
    normalizedText: 'this is a test document with some content',
    ...overrides,
  };
}

describe('computeSimilarityScore', () => {
  describe('quick mode', () => {
    it('returns only jaccard similarity', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });
      const result = computeSimilarityScore(doc1, doc2, 0.85, defaultWeights, {
        quickMode: true,
      });

      expect(result.overall).toBe(0.85);
      expect(result.jaccard).toBe(0.85);
      expect(result.fuzzy).toBe(0);
      expect(result.discriminative).toBe(0);
    });
  });

  describe('full mode', () => {
    it('computes base score from jaccard and fuzzy with penalty applied', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });

      const result = computeSimilarityScore(doc1, doc2, 0.8, defaultWeights);
      expect(result.jaccard).toBe(0.8);
      expect(result.overall).toBeGreaterThan(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('excludes zero-weight components from base score', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2', title: 'Totally Different Title' });

      const weightsJaccardOnly: SimilarityWeights = {
        jaccard: 100,
        fuzzy: 0,
        discriminativePenaltyStrength: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.8, weightsJaccardOnly);
      // Fuzzy should still be computed but not affect base
      expect(result.fuzzy).toBeDefined();
      // With penalty strength 0, overall = base = jaccard only
      expect(result.overall).toBeCloseTo(0.8);
    });

    it('computes identical docs with score close to 1', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });

      const result = computeSimilarityScore(doc1, doc2, 1.0, defaultWeights);
      expect(result.overall).toBeGreaterThan(0.9);
      expect(result.fuzzy).toBe(1.0);
    });

    it('always computes discriminative score even when penalty strength is 0', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement date 01/15/2024 balance $1,234.56',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement date 01/15/2024 balance $1,234.56',
      });

      const weightsNoPenalty: SimilarityWeights = {
        jaccard: 55,
        fuzzy: 45,
        discriminativePenaltyStrength: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.9, weightsNoPenalty);
      // Discriminative score should still be computed (1.0 for identical content)
      expect(result.discriminative).toBe(1.0);
      // With penalty strength 0, overall = base (no penalty applied)
      const expectedBase = (0.9 * 55 + result.fuzzy * 45) / 100;
      expect(result.overall).toBeCloseTo(expectedBase, 5);
    });

    it('penalizes overall when discriminative score is low', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement 01/15/2024 balance $1,000.00 account 123456',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement 06/30/2025 balance $9,999.00 account 654321',
      });

      const weightsWithPenalty: SimilarityWeights = {
        jaccard: 60,
        fuzzy: 40,
        discriminativePenaltyStrength: 50,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.9, weightsWithPenalty);
      // Discriminative score should be low (different dates/amounts/refs)
      expect(result.discriminative).toBeLessThan(0.3);
      // Overall should be significantly penalized
      const base = (0.9 * 60 + result.fuzzy * 40) / 100;
      expect(result.overall).toBeLessThan(base);
    });

    it('penalty has no effect when discriminative score is 1.0', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement 01/15/2024 balance $1,000.00 account 123456',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement 01/15/2024 balance $1,000.00 account 123456',
      });

      const weightsMaxPenalty: SimilarityWeights = {
        jaccard: 60,
        fuzzy: 40,
        discriminativePenaltyStrength: 100,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.9, weightsMaxPenalty);
      expect(result.discriminative).toBe(1.0);
      // With D=1.0, penalty multiplier = 1 - strength*(1-1) = 1, so overall = base
      const base = (0.9 * 60 + result.fuzzy * 40) / 100;
      expect(result.overall).toBeCloseTo(base, 5);
    });

    it('penalty strength 0 produces same result as base score', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement 01/15/2024 balance $1,000.00',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement 06/30/2025 balance $9,999.00',
      });

      const noPenalty: SimilarityWeights = {
        jaccard: 60,
        fuzzy: 40,
        discriminativePenaltyStrength: 0,
      };
      const withPenalty: SimilarityWeights = {
        jaccard: 60,
        fuzzy: 40,
        discriminativePenaltyStrength: 80,
      };

      const resultNoPenalty = computeSimilarityScore(doc1, doc2, 0.9, noPenalty);
      const resultWithPenalty = computeSimilarityScore(doc1, doc2, 0.9, withPenalty);

      // Same base, but penalty reduces the overall
      const base = (0.9 * 60 + resultNoPenalty.fuzzy * 40) / 100;
      expect(resultNoPenalty.overall).toBeCloseTo(base, 5);
      expect(resultWithPenalty.overall).toBeLessThan(resultNoPenalty.overall);
    });
  });
});
