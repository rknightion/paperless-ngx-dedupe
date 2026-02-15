// Schema
export { document, documentContent, documentSignature } from './schema/sqlite/documents.js';
export { duplicateGroup, duplicateMember } from './schema/sqlite/duplicates.js';
export { job } from './schema/sqlite/jobs.js';
export { appConfig, syncState } from './schema/sqlite/app.js';
export {
  documentRelations,
  documentContentRelations,
  documentSignatureRelations,
  duplicateGroupRelations,
  duplicateMemberRelations,
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
  NewDocument,
  NewDocumentContent,
  NewDocumentSignature,
  NewDuplicateGroup,
  NewDuplicateMember,
  NewJob,
  NewAppConfigRow,
  NewSyncState,
} from './schema/types.js';
export {
  ProcessingStatus,
  JobType,
  JobStatus,
  GroupStatus,
  GROUP_STATUS_VALUES,
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
  DocumentMetadata,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
  PaginatedResponse,
  ConnectionTestResult,
} from './paperless/types.js';
export {
  paperlessDocumentSchema,
  documentMetadataSchema,
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
export { UnionFind } from './dedup/union-find.js';
export { getDedupConfig, setDedupConfig, recalculateConfidenceScores } from './dedup/config.js';
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
  batchSetStatus,
  buildGroupWhere,
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
  registerObservableGauges,
  OtelDrizzleLogger,
  initWorkerTelemetry,
  shutdownWorkerTelemetry,
  flushWorkerTelemetry,
  serializeTraceContext,
  extractTraceContext,
} from './telemetry/index.js';

// Export
export { getDuplicateGroupsForExport, formatDuplicatesCsv } from './export/csv.js';
export { exportConfig, importConfig } from './export/config.js';
export type { DuplicateExportRow, ConfigBackup } from './export/types.js';
