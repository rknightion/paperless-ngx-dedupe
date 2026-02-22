import { describe, it, expect } from 'vitest';
import { computeSimilarityScore } from '../scoring.js';
import type { DocumentScoringData, SimilarityWeights } from '../types.js';

const defaultWeights: SimilarityWeights = {
  jaccard: 55,
  fuzzy: 45,
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
  });
});
