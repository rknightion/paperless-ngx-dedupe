// Schema
export { document, documentContent, documentSignature } from './schema/sqlite/documents.js';
export { duplicateGroup, duplicateMember } from './schema/sqlite/duplicates.js';
export { job } from './schema/sqlite/jobs.js';
export { appConfig, syncState } from './schema/sqlite/app.js';
export { aiProcessingResult } from './schema/sqlite/ai-processing.js';
export { documentChunk, ragConversation, ragMessage } from './schema/sqlite/rag.js';
export {
  documentRelations,
  documentContentRelations,
  documentSignatureRelations,
  duplicateGroupRelations,
  duplicateMemberRelations,
  aiProcessingResultRelations,
  documentChunkRelations,
  ragConversationRelations,
  ragMessageRelations,
} from './schema/relations.js';

// Types
export type {
  Document,
  DocumentContent,
  DocumentSignature,
  DuplicateGroup,
  DuplicateMember,
  Job,
  AppConfigRow,
  SyncState,
  AiProcessingResult,
  NewDocument,
  NewDocumentContent,
  NewDocumentSignature,
  NewDuplicateGroup,
  NewDuplicateMember,
  NewJob,
  NewAppConfigRow,
  NewSyncState,
  NewAiProcessingResult,
} from './schema/types.js';
export {
  ProcessingStatus,
  JobType,
  JobStatus,
  GroupStatus,
  GROUP_STATUS_VALUES,
  AiProvider,
  AiAppliedStatus,
} from './types/enums.js';
export type { AppConfig } from './config.js';

// Database
export { createDatabase, createDatabaseWithHandle } from './db/client.js';
export type { AppDatabase } from './db/client.js';
export { migrateDatabase } from './db/migrate.js';

// Config
export { parseConfig } from './config.js';

// Logger
export { initLogger, createLogger, getLogger } from './logger.js';
export type { Logger } from './logger.js';

// Paperless
export type {
  PaperlessConfig,
  PaperlessDocument,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
  PaginatedResponse,
  ConnectionTestResult,
  DocumentUpdate,
} from './paperless/types.js';
export {
  paperlessDocumentSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paperlessStatisticsSchema,
  connectionTestResultSchema,
  paperlessConfigSchema,
  paginatedResponseSchema,
  toPaperlessConfig,
} from './paperless/schemas.js';

export { PaperlessClient } from './paperless/client.js';
export {
  PaperlessApiError,
  PaperlessAuthError,
  PaperlessConnectionError,
} from './paperless/errors.js';

// Jobs
export {
  createJob,
  getJob,
  listJobs,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
  recoverStaleJobs,
  JobAlreadyRunningError,
} from './jobs/manager.js';
export type { JobFilters } from './jobs/manager.js';

// Worker Infrastructure
export { launchWorker } from './jobs/worker-launcher.js';
export type { LaunchWorkerOptions, WorkerHandle } from './jobs/worker-launcher.js';
export { runWorkerTask } from './jobs/worker-entry.js';
export type { ProgressCallback, WorkerContext, TaskFunction } from './jobs/worker-entry.js';
export { getWorkerPath } from './jobs/worker-paths.js';
export type { WorkerName } from './jobs/worker-paths.js';

// Sync
export { syncDocuments } from './sync/sync-documents.js';
export { purgeAllDocumentData } from './sync/purge.js';
export type { PurgeResult } from './sync/purge.js';
export { normalizeText } from './sync/normalize.js';
export type { NormalizedResult } from './sync/normalize.js';
export { computeFingerprint } from './sync/fingerprint.js';
export type {
  SyncProgressCallback,
  SyncOptions,
  SyncResult,
  SyncDependencies,
  ReferenceMaps,
} from './sync/types.js';

// Dedup
export { fnv1a32, textToShingles } from './dedup/shingles.js';
export { MinHash } from './dedup/minhash.js';
export { LSHIndex } from './dedup/lsh.js';
export { tokenSortRatio, sampleText } from './dedup/fuzzy.js';
export { computeSimilarityScore } from './dedup/scoring.js';
export { computeDiscriminativeScore, extractDiscriminativeTokens } from './dedup/discriminative.js';
export { UnionFind } from './dedup/union-find.js';
export { getDedupConfig, setDedupConfig, recalculateConfidenceScores } from './dedup/config.js';
export {
  computeAnalysisConfigHash,
  checkAnalysisStaleness,
  saveAnalysisConfigHash,
  getLastAnalysisConfigHash,
} from './dedup/analysis-hash.js';
export type { AnalysisStalenessInfo } from './dedup/analysis-hash.js';
export { runAnalysis } from './dedup/analyze.js';
export {
  DEFAULT_DEDUP_CONFIG,
  dedupConfigBaseSchema,
  dedupConfigSchema,
  ALGORITHM_VERSION,
} from './dedup/types.js';
export type {
  DedupConfig,
  SimilarityWeights,
  SimilarityResult,
  DocumentScoringData,
  AnalysisOptions,
  AnalysisResult,
  ScoringOptions,
} from './dedup/types.js';

// Queries
export {
  paginationSchema,
  duplicateGroupFiltersSchema,
  documentFiltersSchema,
  similarityGraphFiltersSchema,
} from './queries/types.js';
export type {
  PaginationParams,
  PaginatedResult,
  DocumentFilters,
  DuplicateGroupFilters,
  DocumentSummary,
  DocumentDetail,
  DuplicateGroupSummary,
  DuplicateGroupDetail,
  DuplicateGroupMember,
  DuplicateStats,
  ConfidenceBucket,
  DashboardData,
  DocumentStats,
  SimilarityGraphFilters,
  GraphNode,
  GraphEdge,
  SimilarityGraphData,
} from './queries/types.js';
export { parseTagsJson } from './queries/helpers.js';
export { getDashboard } from './queries/dashboard.js';
export {
  getDocuments,
  getDocument,
  getDocumentContent,
  getDocumentStats,
  incrementUsageStats,
} from './queries/documents.js';
export {
  getDuplicateGroups,
  getDuplicateGroup,
  getDuplicateGroupLight,
  getDuplicateStats,
  getSimilarityGraph,
  setPrimaryDocument,
  setGroupStatus,
  deleteDuplicateGroup,
  purgeDeletedGroups,
  batchSetStatus,
  buildGroupWhere,
  archiveAndDeleteMembers,
  backfillDeletedGroupArchives,
  StatusTransitionError,
} from './queries/duplicates.js';
export { getConfig, setConfig, setConfigBatch } from './queries/config.js';

// Telemetry
export {
  getTracer,
  withSpan,
  withSpanSync,
  syncDocumentsTotal,
  syncRunsTotal,
  analysisRunsTotal,
  jobsTotal,
  paperlessRequestsTotal,
  syncDuration,
  analysisDuration,
  analysisStageDuration,
  aiDocumentsTotal,
  aiTokensTotal,
  aiRunsTotal,
  aiApplyTotal,
  aiDocumentDuration,
  aiBatchDuration,
  registerObservableGauges,
  OtelDrizzleLogger,
  initWorkerTelemetry,
  shutdownWorkerTelemetry,
  flushWorkerTelemetry,
  serializeTraceContext,
  extractTraceContext,
  PaperlessMetricsCoordinator,
  COLLECTOR_IDS,
} from './telemetry/index.js';
export type { PaperlessMetricsOptions, CollectorId } from './telemetry/index.js';

// Export
export { getDuplicateGroupsForExport, formatDuplicatesCsv } from './export/csv.js';
export { exportConfig, importConfig } from './export/config.js';
export type { DuplicateExportRow, ConfigBackup } from './export/types.js';

// AI
export { getAiConfig, setAiConfig } from './ai/config.js';
export {
  aiConfigSchema,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_AI_CONFIG,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  AI_CONFIG_PREFIX,
} from './ai/types.js';
export type { AiConfig, AiBatchResult } from './ai/types.js';
export type {
  AiExtractionRequest,
  AiExtractionResponse,
  AiProviderUsage,
  AiExtractionResult,
  AiProviderInterface,
  AiFailureType,
} from './ai/providers/types.js';
export { AiExtractionError, aiExtractionResponseSchema } from './ai/providers/types.js';
export { createAiProvider } from './ai/providers/factory.js';
export { buildPromptParts, truncateContent } from './ai/prompt.js';
export type { PromptParts, BuildPromptOptions } from './ai/prompt.js';
export { processDocument } from './ai/extract.js';
export type { ProcessDocumentOptions } from './ai/extract.js';
export { processBatch } from './ai/batch.js';
export type { BatchProcessOptions } from './ai/batch.js';
export {
  getAiResults,
  getAiResult,
  getAiStats,
  markAiResultApplied,
  markAiResultRejected,
  markAiResultFailed,
  batchMarkApplied,
  batchMarkRejected,
  getPendingAiResultIds,
  getAiResultIdsByFilter,
  getDocumentIdsByAiFilter,
  getUnprocessedDocuments,
} from './ai/queries.js';
export type {
  AiResultFilters,
  AiResultSummary,
  AiResultDetail,
  AiStats,
  ApplySnapshot,
  UnprocessedDocument,
} from './ai/queries.js';
export { normalizeSuggestedLabel, normalizeSuggestedTags } from './ai/normalize.js';
export {
  applyAiResult,
  rejectAiResult,
  rejectAiResultWithReason,
  batchRejectAiResults,
} from './ai/apply.js';
export type { ApplyOptions } from './ai/apply.js';
export { revertAiResult } from './ai/revert.js';
export { recordFeedback, getFeedbackSummary } from './ai/feedback.js';
export type { AiFeedback, AiFeedbackSummary } from './ai/feedback.js';
export {
  getFailedDocumentIds,
  resolveProcessScope,
  resolveResultIdsForApplyScope,
} from './ai/scopes.js';
export type { ProcessScope, ApplyScope } from './ai/scopes.js';
export { getAiResultGroups } from './ai/grouping.js';
export type { GroupByField, AiResultGroup, AiGroupedResults } from './ai/grouping.js';
export { computeApplyPreflight } from './ai/preflight.js';
export type { ApplyPreflightResult } from './ai/preflight.js';
export { evaluateGates } from './ai/gates.js';
export type { GateEvaluation, GateInput, GateContext, AiField } from './ai/gates.js';
export { evaluateAndAutoApply } from './ai/auto-apply.js';
export type { AutoApplyResult } from './ai/auto-apply.js';
export {
  fetchAndCachePricing,
  refreshPricingIfStale,
  getModelPricing,
  estimateResultCost,
  estimateBatchCost,
  getCostStats,
  backfillCosts,
} from './ai/costs.js';
export type { ModelPricing, AiCostEstimate, AiCostStats } from './ai/costs.js';

// RAG
export { getRagConfig, setRagConfig } from './rag/config.js';
export {
  ragConfigSchema,
  DEFAULT_RAG_SYSTEM_PROMPT,
  DEFAULT_RAG_CONFIG,
  OPENAI_EMBEDDING_MODELS,
  RAG_CONFIG_PREFIX,
} from './rag/types.js';
export type {
  RagConfig,
  Chunk,
  SearchResult,
  RagSource,
  RagStats,
  CostEstimate,
} from './rag/types.js';
export { loadSqliteVec, initRagTables } from './rag/vector-store.js';
export { chunkDocument } from './rag/chunker.js';
export {
  generateEmbeddings,
  generateEmbedding,
  embeddingOptionsFromConfig,
} from './rag/embeddings.js';
export { hybridSearch } from './rag/search.js';
export { askDocuments } from './rag/ask.js';
export type { AskResult } from './rag/ask.js';
export { indexDocuments } from './rag/indexer.js';
export type { IndexProgress, IndexResult, IndexOptions } from './rag/indexer.js';
export {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  addMessage,
  getConversationMessages,
} from './rag/conversations.js';
export type {
  ConversationSummary,
  ConversationDetail,
  MessageDetail,
} from './rag/conversations.js';
export { getRagStats } from './rag/queries.js';
