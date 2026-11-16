import { z } from 'zod';
import type { ProgressCallback } from '../jobs/worker-entry.js';

export const ALGORITHM_VERSION = '1.2.0';
export const DEDUP_CONFIG_PREFIX = 'dedup.';
export const PRIMARY_STRATEGIES = [
  'lowest_id',
  'oldest_added',
  'newest_added',
  'most_text',
  'most_metadata',
] as const;
export type PrimaryStrategy = (typeof PRIMARY_STRATEGIES)[number];

export interface SimilarityWeights {
  jaccard: number;
  fuzzy: number;
  discriminativePenaltyStrength: number;
}

export interface SimilarityResult {
  overall: number;
  jaccard: number;
  fuzzy: number;
  discriminative: number;
}

export interface DocumentScoringData {
  id: string;
  title: string;
  normalizedText: string;
  /** Sorted tokens of the text sampled at the scoring options' fuzzySampleSize. */
  sortedTokens?: string;
}

export interface DedupConfig {
  excludedTagNames: string[];
  primaryStrategy: PrimaryStrategy;
  numPermutations: number;
  numBands: number;
  ngramSize: number;
  minWords: number;
  similarityThreshold: number;
  confidenceWeightJaccard: number;
  confidenceWeightFuzzy: number;
  discriminativePenaltyStrength: number;
  fuzzySampleSize: number;
  /** @deprecated Ignored; retained so stored configs and config backups keep validating. */
  autoAnalyze: boolean;
}

export const dedupConfigBaseSchema = z.object({
  excludedTagNames: z.array(z.string().min(1)).default([]),
  primaryStrategy: z.enum(PRIMARY_STRATEGIES).default('lowest_id'),
  numPermutations: z.number().int().min(16).max(1024).default(256),
  numBands: z.number().int().min(1).max(100).default(32),
  ngramSize: z.number().int().min(1).max(10).default(3),
  minWords: z.number().int().min(1).max(1000).default(20),
  similarityThreshold: z.number().min(0).max(1).default(0.75),
  confidenceWeightJaccard: z.number().int().min(0).max(100).default(60),
  confidenceWeightFuzzy: z.number().int().min(0).max(100).default(40),
  discriminativePenaltyStrength: z.number().int().min(0).max(100).default(70),
  fuzzySampleSize: z.number().int().min(100).max(100000).default(10000),
  autoAnalyze: z.boolean().default(true),
});

export const dedupConfigSchema = dedupConfigBaseSchema
  .refine((data) => data.confidenceWeightJaccard + data.confidenceWeightFuzzy === 100, {
    message: 'Confidence weights must sum to 100',
  })
  .refine((data) => data.numBands <= data.numPermutations, {
    message: 'numBands must not exceed numPermutations',
    path: ['numBands'],
  });

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  excludedTagNames: [],
  primaryStrategy: 'lowest_id',
  numPermutations: 256,
  numBands: 32,
  ngramSize: 3,
  minWords: 20,
  similarityThreshold: 0.75,
  confidenceWeightJaccard: 60,
  confidenceWeightFuzzy: 40,
  discriminativePenaltyStrength: 70,
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
  documentsSkipped: number;
  skipReasons?: {
    excludedByTag: number;
    noContent: number;
    tooShort: number;
    shinglesFailed: number;
  };
  isFullRebuild: boolean;
  signaturesGenerated: number;
  signaturesReused: number;
  candidatePairsFound: number;
  candidatePairsScored: number;
  candidatePairsSkippedConnected: number;
  pairsSuppressed: number;
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
