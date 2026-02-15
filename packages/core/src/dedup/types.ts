import { z } from 'zod';
import type { ProgressCallback } from '../jobs/worker-entry.js';

export const ALGORITHM_VERSION = '1.0.0';
export const DEDUP_CONFIG_PREFIX = 'dedup.';

export interface SimilarityWeights {
  jaccard: number;
  fuzzy: number;
  metadata: number;
  filename: number;
}

export interface SimilarityResult {
  overall: number;
  jaccard: number;
  fuzzy: number;
  metadata: number;
  filename: number;
}

export interface DocumentScoringData {
  id: string;
  title: string;
  normalizedText: string;
  originalFileSize: number | null;
}

export interface DedupConfig {
  numPermutations: number;
  numBands: number;
  ngramSize: number;
  minWords: number;
  similarityThreshold: number;
  confidenceWeightJaccard: number;
  confidenceWeightFuzzy: number;
  confidenceWeightMetadata: number;
  confidenceWeightFilename: number;
  fuzzySampleSize: number;
  autoAnalyze: boolean;
}

export const dedupConfigBaseSchema = z.object({
  numPermutations: z.number().int().min(16).max(1024).default(192),
  numBands: z.number().int().min(1).max(100).default(20),
  ngramSize: z.number().int().min(1).max(10).default(3),
  minWords: z.number().int().min(1).max(1000).default(20),
  similarityThreshold: z.number().min(0).max(1).default(0.75),
  confidenceWeightJaccard: z.number().int().min(0).max(100).default(40),
  confidenceWeightFuzzy: z.number().int().min(0).max(100).default(30),
  confidenceWeightMetadata: z.number().int().min(0).max(100).default(15),
  confidenceWeightFilename: z.number().int().min(0).max(100).default(15),
  fuzzySampleSize: z.number().int().min(100).max(100000).default(5000),
  autoAnalyze: z.boolean().default(true),
});

export const dedupConfigSchema = dedupConfigBaseSchema.refine(
  (data) =>
    data.confidenceWeightJaccard +
      data.confidenceWeightFuzzy +
      data.confidenceWeightMetadata +
      data.confidenceWeightFilename ===
    100,
  { error: 'Confidence weights must sum to 100' },
);

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  numPermutations: 192,
  numBands: 20,
  ngramSize: 3,
  minWords: 20,
  similarityThreshold: 0.75,
  confidenceWeightJaccard: 40,
  confidenceWeightFuzzy: 30,
  confidenceWeightMetadata: 15,
  confidenceWeightFilename: 15,
  fuzzySampleSize: 5000,
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
  originalFileSize: number | null;
}

export interface ScoringOptions {
  quickMode?: boolean;
  fuzzySampleSize?: number;
}
