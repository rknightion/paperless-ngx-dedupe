/**
 * Multi-factor weighted similarity scoring.
 */

import { tokenSortRatio, sampleText } from './fuzzy.js';
import { computeDiscriminativeScore } from './discriminative.js';
import type {
  DocumentScoringData,
  SimilarityResult,
  SimilarityWeights,
  ScoringOptions,
} from './types.js';

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
      discriminative: 0,
    };
  }

  const maxChars = options?.fuzzySampleSize ?? 5000;
  const fuzzyScore = tokenSortRatio(
    sampleText(doc1.normalizedText, maxChars),
    sampleText(doc2.normalizedText, maxChars),
  );

  // Always compute discriminative score for UI visibility, even when weight=0
  const discriminativeScore = computeDiscriminativeScore(doc1.normalizedText, doc2.normalizedText);

  const components: { score: number; weight: number }[] = [];
  if (weights.jaccard > 0) components.push({ score: jaccardSimilarity, weight: weights.jaccard });
  if (weights.fuzzy > 0) components.push({ score: fuzzyScore, weight: weights.fuzzy });
  if (weights.discriminative > 0)
    components.push({ score: discriminativeScore, weight: weights.discriminative });

  let overall = 0;
  if (components.length > 0) {
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    overall = components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;
  }

  return {
    overall,
    jaccard: jaccardSimilarity,
    fuzzy: fuzzyScore,
    discriminative: discriminativeScore,
  };
}
