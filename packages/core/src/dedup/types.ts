import { z } from 'zod';
import type { ProgressCallback } from '../jobs/worker-entry.js';

export const ALGORITHM_VERSION = '1.0.0';
export const DEDUP_CONFIG_PREFIX = 'dedup.';

export interface SimilarityWeights {
  jaccard: number;
  fuzzy: number;
}

export interface SimilarityResult {
  overall: number;
  jaccard: number;
  fuzzy: number;
}

export interface DocumentScoringData {
  id: string;
  title: string;
  normalizedText: string;
}

export interface DedupConfig {
  numPermutations: number;
  numBands: number;
  ngramSize: number;
  minWords: number;
  similarityThreshold: number;
  confidenceWeightJaccard: number;
  confidenceWeightFuzzy: number;
  fuzzySampleSize: number;
  autoAnalyze: boolean;
}

export const dedupConfigBaseSchema = z.object({
  numPermutations: z.number().int().min(16).max(1024).default(256),
  numBands: z.number().int().min(1).max(100).default(32),
  ngramSize: z.number().int().min(1).max(10).default(3),
  minWords: z.number().int().min(1).max(1000).default(20),
  similarityThreshold: z.number().min(0).max(1).default(0.75),
  confidenceWeightJaccard: z.number().int().min(0).max(100).default(55),
  confidenceWeightFuzzy: z.number().int().min(0).max(100).default(45),
  fuzzySampleSize: z.number().int().min(100).max(100000).default(10000),
  autoAnalyze: z.boolean().default(true),
});

export const dedupConfigSchema = dedupConfigBaseSchema.refine(
  (data) => data.confidenceWeightJaccard + data.confidenceWeightFuzzy === 100,
  { message: 'Confidence weights must sum to 100' },
);

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  numPermutations: 256,
  numBands: 32,
  ngramSize: 3,
  minWords: 20,
  similarityThreshold: 0.75,
  confidenceWeightJaccard: 55,
  confidenceWeightFuzzy: 45,
  fuzzySampleSize: 10000,
  autoAnalyze: true,
};

export interface AnalysisOptions {
  force?: boolean;
  onProgress?: ProgressCallback;
}

export interface AnalysisResult {
  totalDocuments: number;
  documentsAnalyzed: number;
  signaturesGenerated: number;
  signaturesReused: number;
  candidatePairsFound: number;
  candidatePairsScored: number;
  groupsCreated: number;
  groupsUpdated: number;
  groupsRemoved: number;
  durationMs: number;
}

export interface CandidatePair {
  docId1: string;
  docId2: string;
}

export interface ScoredPair {
  docId1: string;
  docId2: string;
  similarity: SimilarityResult;
}

export interface DocumentForScoring {
  id: string;
  title: string;
  normalizedText: string;
}

export interface ScoringOptions {
  quickMode?: boolean;
  fuzzySampleSize?: number;
}
