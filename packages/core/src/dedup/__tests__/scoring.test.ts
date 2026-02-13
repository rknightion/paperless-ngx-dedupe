import { describe, it, expect } from 'vitest';
import { computeSimilarityScore } from '../scoring.js';
import type { DocumentScoringData, SimilarityWeights } from '../types.js';

const defaultWeights: SimilarityWeights = {
  jaccard: 40,
  fuzzy: 30,
  metadata: 15,
  filename: 15,
};

function makeDoc(overrides: Partial<DocumentScoringData> = {}): DocumentScoringData {
  return {
    id: 'doc1',
    title: 'Test Document',
    normalizedText: 'this is a test document with some content',
    correspondent: 'John Doe',
    documentType: 'invoice',
    originalFileSize: 1000,
    createdDate: '2024-01-15',
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
      expect(result.metadata).toBe(0);
      expect(result.filename).toBe(0);
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

      const weightsNoFilename: SimilarityWeights = {
        jaccard: 50,
        fuzzy: 30,
        metadata: 20,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.8, weightsNoFilename);
      // Filename component should still be computed but not affect overall
      expect(result.filename).toBeDefined();
      // The overall should only be based on jaccard, fuzzy, metadata
      expect(result.overall).toBeGreaterThan(0);
    });

    it('computes identical docs with score close to 1', () => {
      const doc1 = makeDoc();
      const doc2 = makeDoc({ id: 'doc2' });

      const result = computeSimilarityScore(doc1, doc2, 1.0, defaultWeights);
      expect(result.overall).toBeGreaterThan(0.9);
      expect(result.fuzzy).toBe(1.0);
      expect(result.filename).toBe(1.0);
      expect(result.metadata).toBe(1.0);
    });
  });

  describe('metadata sub-components', () => {
    it('computes file size ratio', () => {
      const doc1 = makeDoc({ originalFileSize: 1000 });
      const doc2 = makeDoc({
        id: 'doc2',
        originalFileSize: 500,
        correspondent: null,
        documentType: null,
        createdDate: null,
      });

      // Metadata-only weights
      const weights: SimilarityWeights = {
        jaccard: 0,
        fuzzy: 0,
        metadata: 100,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.5, weights);
      // Only size ratio is non-null: min(1000,500)/max(1000,500) = 0.5
      expect(result.metadata).toBe(0.5);
    });

    it('computes date proximity with 30-day threshold', () => {
      const doc1 = makeDoc({
        createdDate: '2024-01-15',
        correspondent: null,
        documentType: null,
        originalFileSize: null,
      });
      const doc2 = makeDoc({
        id: 'doc2',
        createdDate: '2024-01-20',
        correspondent: null,
        documentType: null,
        originalFileSize: null,
      });

      const weights: SimilarityWeights = {
        jaccard: 0,
        fuzzy: 0,
        metadata: 100,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.5, weights);
      // 5 days apart, within 30 days → 1.0
      expect(result.metadata).toBe(1.0);
    });

    it('computes date proximity with decay beyond 30 days', () => {
      const doc1 = makeDoc({
        createdDate: '2024-01-01',
        correspondent: null,
        documentType: null,
        originalFileSize: null,
      });
      const doc2 = makeDoc({
        id: 'doc2',
        createdDate: '2024-07-01',
        correspondent: null,
        documentType: null,
        originalFileSize: null,
      });

      const weights: SimilarityWeights = {
        jaccard: 0,
        fuzzy: 0,
        metadata: 100,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.5, weights);
      // ~182 days apart, well beyond 30 days, should be between 0 and 1
      expect(result.metadata).toBeGreaterThan(0);
      expect(result.metadata).toBeLessThan(1);
    });

    it('computes type match', () => {
      const doc1 = makeDoc({
        documentType: 'invoice',
        correspondent: null,
        originalFileSize: null,
        createdDate: null,
      });
      const doc2 = makeDoc({
        id: 'doc2',
        documentType: 'receipt',
        correspondent: null,
        originalFileSize: null,
        createdDate: null,
      });

      const weights: SimilarityWeights = {
        jaccard: 0,
        fuzzy: 0,
        metadata: 100,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.5, weights);
      expect(result.metadata).toBe(0.0);
    });

    it('computes correspondent match', () => {
      const doc1 = makeDoc({
        correspondent: 'Alice',
        documentType: null,
        originalFileSize: null,
        createdDate: null,
      });
      const doc2 = makeDoc({
        id: 'doc2',
        correspondent: 'Alice',
        documentType: null,
        originalFileSize: null,
        createdDate: null,
      });

      const weights: SimilarityWeights = {
        jaccard: 0,
        fuzzy: 0,
        metadata: 100,
        filename: 0,
      };

      const result = computeSimilarityScore(doc1, doc2, 0.5, weights);
      expect(result.metadata).toBe(1.0);
    });

    it('handles all null metadata gracefully', () => {
      const doc1 = makeDoc({
        correspondent: null,
        documentType: null,
        originalFileSize: null,
        createdDate: null,
      });
      const doc2 = makeDoc({
        id: 'doc2',
        correspondent: null,
        documentType: null,
        originalFileSize: null,
        createdDate: null,
      });

      const result = computeSimilarityScore(doc1, doc2, 0.5, defaultWeights);
      expect(result.metadata).toBe(0);
    });
  });
});
