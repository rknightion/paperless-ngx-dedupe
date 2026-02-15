/**
 * Multi-factor weighted similarity scoring.
 */

import { tokenSortRatio, sampleText } from './fuzzy.js';
import type {
  DocumentScoringData,
  SimilarityResult,
  SimilarityWeights,
  ScoringOptions,
} from './types.js';

function computeFileSizeRatio(size1: number | null, size2: number | null): number | null {
  if (size1 == null || size2 == null || size1 === 0 || size2 === 0) {
    return null;
  }
  return Math.min(size1, size2) / Math.max(size1, size2);
}

function computeMetadataScore(doc1: DocumentScoringData, doc2: DocumentScoringData): number {
  return computeFileSizeRatio(doc1.originalFileSize, doc2.originalFileSize) ?? 0;
}

export function computeSimilarityScore(
  doc1: DocumentScoringData,
  doc2: DocumentScoringData,
  jaccardSimilarity: number,
  weights: SimilarityWeights,
  options?: ScoringOptions,
): SimilarityResult {
  if (options?.quickMode) {
    return {
      overall: jaccardSimilarity,
      jaccard: jaccardSimilarity,
      fuzzy: 0,
      metadata: 0,
      filename: 0,
    };
  }

  const maxChars = options?.fuzzySampleSize ?? 5000;
  const fuzzyScore = tokenSortRatio(
    sampleText(doc1.normalizedText, maxChars),
    sampleText(doc2.normalizedText, maxChars),
  );
  const metadataScore = computeMetadataScore(doc1, doc2);
  const filenameScore = tokenSortRatio(doc1.title, doc2.title);

  const components: { score: number; weight: number }[] = [];
  if (weights.jaccard > 0) components.push({ score: jaccardSimilarity, weight: weights.jaccard });
  if (weights.fuzzy > 0) components.push({ score: fuzzyScore, weight: weights.fuzzy });
  if (weights.metadata > 0) components.push({ score: metadataScore, weight: weights.metadata });
  if (weights.filename > 0) components.push({ score: filenameScore, weight: weights.filename });

  let overall = 0;
  if (components.length > 0) {
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    overall = components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;
  }

  return {
    overall,
    jaccard: jaccardSimilarity,
    fuzzy: fuzzyScore,
    metadata: metadataScore,
    filename: filenameScore,
  };
}
