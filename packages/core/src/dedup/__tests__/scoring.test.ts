import { describe, it, expect } from 'vitest';
import { computeSimilarityScore } from '../scoring.js';
import type { DocumentScoringData, SimilarityWeights } from '../types.js';

const defaultWeights: SimilarityWeights = {
  jaccard: 50,
  fuzzy: 35,
  discriminative: 15,
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
    it('computes weighted average of all components', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });

      const result = computeSimilarityScore(doc1, doc2, 0.8, defaultWeights);
      expect(result.jaccard).toBe(0.8);
      expect(result.overall).toBeGreaterThan(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('excludes zero-weight components from weighted average', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2', title: 'Totally Different Title' });

      const weightsNoFuzzy: SimilarityWeights = {
        jaccard: 100,
        fuzzy: 0,
        discriminative: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.8, weightsNoFuzzy);
      // Fuzzy component should still be computed but not affect overall
      expect(result.fuzzy).toBeDefined();
      // The overall should only be based on jaccard
      expect(result.overall).toBeCloseTo(0.8);
    });

    it('computes identical docs with score close to 1', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });

      const result = computeSimilarityScore(doc1, doc2, 1.0, defaultWeights);
      expect(result.overall).toBeGreaterThan(0.9);
      expect(result.fuzzy).toBe(1.0);
    });

    it('always computes discriminative score even when weight is 0', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement date 01/15/2024 balance $1,234.56',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement date 01/15/2024 balance $1,234.56',
      });

      const weightsNoDiscriminative: SimilarityWeights = {
        jaccard: 55,
        fuzzy: 45,
        discriminative: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.9, weightsNoDiscriminative);
      // Discriminative score should be computed (1.0 for identical content)
      expect(result.discriminative).toBe(1.0);
      // But should not affect overall since weight=0
      const expectedOverall = (0.9 * 55 + result.fuzzy * 45) / 100;
      expect(result.overall).toBeCloseTo(expectedOverall, 5);
    });

    it('includes discriminative score in overall when weight > 0', () => {
      const doc1 = makeDoc({
        normalizedText: 'statement 01/15/2024 balance $1,000.00 account 123456',
      });
      const doc2 = makeDoc({
        id: 'doc2',
        normalizedText: 'statement 06/30/2025 balance $9,999.00 account 654321',
      });

      const weightsWithDiscriminative: SimilarityWeights = {
        jaccard: 40,
        fuzzy: 35,
        discriminative: 25,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.9, weightsWithDiscriminative);
      // Discriminative score should be low (different dates/amounts/refs)
      expect(result.discriminative).toBeLessThan(0.3);
      // Overall should be pulled down by the low discriminative score
      const overallWithoutDiscriminative = (0.9 * 40 + result.fuzzy * 35) / 75;
      expect(result.overall).toBeLessThan(overallWithoutDiscriminative);
    });
  });
});
