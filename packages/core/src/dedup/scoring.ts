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

function computeDateProximity(date1: string | null, date2: string | null): number | null {
  if (date1 == null || date2 == null) {
    return null;
  }
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  if (isNaN(d1) || isNaN(d2)) return null;

  const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return 1.0;
  if (diffDays >= 365) return 0.0;
  return 1.0 - (diffDays - 30) / (365 - 30);
}

function computeTypeMatch(type1: string | null, type2: string | null): number | null {
  if (type1 == null || type2 == null) return null;
  return type1 === type2 ? 1.0 : 0.0;
}

function computeCorrespondentMatch(corr1: string | null, corr2: string | null): number | null {
  if (corr1 == null || corr2 == null) return null;
  return corr1 === corr2 ? 1.0 : 0.0;
}

function computeMetadataScore(doc1: DocumentScoringData, doc2: DocumentScoringData): number {
  const components: number[] = [];

  const sizeRatio = computeFileSizeRatio(doc1.originalFileSize, doc2.originalFileSize);
  if (sizeRatio != null) components.push(sizeRatio);

  const dateProximity = computeDateProximity(doc1.createdDate, doc2.createdDate);
  if (dateProximity != null) components.push(dateProximity);

  const typeMatch = computeTypeMatch(doc1.documentType, doc2.documentType);
  if (typeMatch != null) components.push(typeMatch);

  const corrMatch = computeCorrespondentMatch(doc1.correspondent, doc2.correspondent);
  if (corrMatch != null) components.push(corrMatch);

  if (components.length === 0) return 0;
  return components.reduce((sum, v) => sum + v, 0) / components.length;
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
