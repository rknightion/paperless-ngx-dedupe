export { fnv1a32, textToShingles } from './shingles.js';
export { MinHash } from './minhash.js';
export { LSHIndex } from './lsh.js';
export { tokenSortRatio, sampleText } from './fuzzy.js';
export { computeSimilarityScore } from './scoring.js';
export { UnionFind } from './union-find.js';
export { getDedupConfig, setDedupConfig, recalculateConfidenceScores } from './config.js';
export { runAnalysis } from './analyze.js';
export {
  DEFAULT_DEDUP_CONFIG,
  dedupConfigSchema,
  ALGORITHM_VERSION,
  DEDUP_CONFIG_PREFIX,
} from './types.js';
export type {
  DedupConfig,
  SimilarityWeights,
  SimilarityResult,
  DocumentScoringData,
  AnalysisOptions,
  AnalysisResult,
  CandidatePair,
  ScoredPair,
  DocumentForScoring,
  ScoringOptions,
} from './types.js';
