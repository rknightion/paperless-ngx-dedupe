// Schema
export { document, documentContent, documentSignature } from './schema/sqlite/documents.js';
export { duplicateGroup, duplicateMember } from './schema/sqlite/duplicates.js';
export { job } from './schema/sqlite/jobs.js';
export { appConfig, syncState } from './schema/sqlite/app.js';
export { aiProcessingResult } from './schema/sqlite/ai-processing.js';
export { aiResultRevision } from './schema/sqlite/ai-result-revisions.js';
export { aiCustomFieldPolicy } from './schema/sqlite/ai-custom-field-policy.js';
export {
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
  aiBudgetReservation,
} from './schema/sqlite/automation.js';
export {
  reviewedMutationDocumentCheckpoint,
  reviewedMutationGroupCheckpoint,
  reviewedMutationPlan,
} from './schema/sqlite/review.js';
export {
  documentRelations,
  documentContentRelations,
  documentSignatureRelations,
  duplicateGroupRelations,
  duplicateMemberRelations,
  aiProcessingResultRelations,
  aiResultRevisionRelations,
} from './schema/relations.js';

// Types
export {
  isSafeErrorCode,
  safeMessageForCode,
  sanitizeCorrelationId,
  sanitizeValidationIssues,
  toSafeError,
  SAFE_ERROR_CODES,
} from './contracts/api.js';
export type {
  ApiFailure,
  ApiSuccess,
  SafeError,
  SafeErrorCode,
  SafeErrorContext,
  ValidationIssue,
} from './contracts/api.js';
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
  AiResultRevision,
  AiCustomFieldPolicy,
  AutomationScheduleRow,
  DispatchIntent,
  OperationLease,
  SyncChangeGeneration,
  AiBudgetReservation,
  ReviewedMutationPlan,
  ReviewedMutationGroupCheckpoint,
  ReviewedMutationDocumentCheckpoint,
  NewDocument,
  NewDocumentContent,
  NewDocumentSignature,
  NewDuplicateGroup,
  NewDuplicateMember,
  NewJob,
  NewAppConfigRow,
  NewSyncState,
  NewAiProcessingResult,
  NewAiResultRevision,
  NewAiCustomFieldPolicy,
  NewAutomationScheduleRow,
  NewDispatchIntent,
  NewOperationLease,
  NewSyncChangeGeneration,
  NewAiBudgetReservation,
  NewReviewedMutationPlan,
  NewReviewedMutationGroupCheckpoint,
  NewReviewedMutationDocumentCheckpoint,
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

// Reviewed mutations
export {
  claimDuplicateDeletionPlan,
  consumeDuplicateDeletionPlan,
  completeDuplicateDeletionPlan,
  createDuplicateDeletionPlan,
  finalizeDuplicateGroupLocally,
  getDuplicateDeletionCheckpointState,
  getReviewedMutationPlan,
  markDuplicateDocumentDeleteStarted,
  markDuplicateDocumentFailed,
  markDuplicateDocumentRemoteDeleted,
  markDuplicateGroupConflict,
  markDuplicateGroupStarted,
  reconcileDuplicateDocumentLocally,
  revalidateFrozenDuplicateGroup,
  withDuplicateMutationLease,
  withDuplicateMutationLeaseAsync,
  DuplicateDeletionPreviewError,
  MutationPlanError,
  REVIEWED_MUTATION_PLAN_TTL_MS,
} from './review/mutation-plans.js';
export type {
  ClaimedDuplicateDeletionPlan,
  DuplicateDeletionPlanPayload,
  DuplicateDeletionPlanPreview,
  DuplicateDeletionCheckpointState,
  DuplicateDocumentCheckpoint,
  DuplicateDocumentCheckpointStatus,
  DuplicateGroupCheckpoint,
  DuplicateGroupCheckpointStatus,
  DuplicateGroupRevalidation,
  FrozenDuplicateDocument,
  FrozenDuplicateGroup,
  ReviewedMutationOperation,
} from './review/mutation-plans.js';

// Config
export { parseConfig } from './config.js';

// Scheduling
export {
  toCronExpression,
  nextOccurrence,
  latestMissedOccurrence,
} from './scheduler/occurrences.js';
export type { AutomationSchedule, ScheduleCadence, ScheduleTask } from './scheduler/types.js';
export {
  AUTOMATION_DEFAULTS,
  automationScheduleUpdateSchema,
  ensureAutomationDefaults,
  getAutomationSettings,
  scheduleCadenceSchema,
  updateAutomationSchedule,
} from './scheduler/settings.js';
export type {
  AutomationScheduleUpdate,
  AutomationScheduleView,
  AutomationSettings,
} from './scheduler/settings.js';
export {
  deserializeDispatchTaskData,
  OPERATION_KINDS,
  OPERATION_COMPATIBILITY,
  serializeDispatchTaskData,
} from './scheduler/store.js';
export type { DispatchTaskData, OperationKind } from './scheduler/store.js';
export {
  acquireOperation,
  assertOperationLeaseOwnership,
  consumeDispatchIntents,
  enqueueDueSchedules,
  enqueueManualOperation,
  getDispatchIntent,
  OperationConflictError,
  OperationLeaseOwnershipError,
  releaseOperation,
  renewOperationLease,
} from './scheduler/coordinator.js';
export type {
  DispatchExecutor,
  ResolvedDispatchIntent,
  SchedulerDispatchExecutor,
  SchedulerTickResult,
} from './scheduler/coordinator.js';

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
export { assertSafeTargetUrl, UnsafeUrlError } from './paperless/url-guard.js';
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
  listJobHistory,
  getJobHistoryCounts,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
  pauseJob,
  resumeJob,
  clearJobHistory,
  recoverStaleJobs,
  retryDeadLetterJob,
  JobAlreadyRunningError,
} from './jobs/manager.js';
export type {
  JobFilters,
  JobHistoryQuery,
  JobHistoryPage,
  JobHistoryItem,
} from './jobs/manager.js';
export { JobHistoryQueryError } from './jobs/manager.js';

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
export { buildMatchExplanation } from './dedup/explanations.js';
export type {
  DuplicateMatchExplanation,
  MatchExplanationCategory,
  MatchExplanationComparison,
  MatchExplanationDifference,
  MatchExplanationDocument,
  MatchExplanationShared,
} from './dedup/explanations.js';
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
  duplicateInboxQuerySchema,
  DUPLICATE_HIGH_CONFIDENCE_THRESHOLD,
  duplicateGroupFiltersSchema,
  documentFiltersSchema,
  similarityGraphFiltersSchema,
} from './queries/types.js';
export type {
  PaginationParams,
  PaginatedResult,
  DuplicateInboxQuery,
  DuplicateInboxQueue,
  DuplicateInboxQueueCounts,
  DuplicateInboxPage,
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
  LocalReadiness,
  NextAction,
  NextActionKind,
  PaperlessReadiness,
  Readiness,
} from './queries/types.js';
export { parseTagsJson } from './queries/helpers.js';
export { getDashboard } from './queries/dashboard.js';
export { buildNextActions, getReadiness } from './queries/readiness.js';
export {
  getDocuments,
  getDocument,
  getDocumentContent,
  getDocumentStats,
  incrementUsageStats,
  deleteDocumentLocally,
} from './queries/documents.js';
export {
  listDuplicateInbox,
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
  removeMemberFromGroup,
  removeDocumentFromAllGroups,
  StatusTransitionError,
  PrimaryMemberError,
} from './queries/duplicates.js';
export { getConfig, redactSensitiveConfig, setConfig, setConfigBatch } from './queries/config.js';

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
  AI_CONFIG_PREFIX,
  aiFieldSelectionSchema,
} from './ai/types.js';
export type { AiConfig, AiBatchResult, AiFieldSelection } from './ai/types.js';
export { DEFAULT_TAG_ALIAS_MAP } from './ai/tag-alias-defaults.js';
export { validateTagAliasYaml } from './ai/tag-alias-validation.js';
export type { TagAliasValidationResult } from './ai/tag-alias-validation.js';
export type {
  AiExtractionRequest,
  AiExtractionResponse,
  AiProviderUsage,
  AiExtractionResult,
  AiProviderInterface,
  AiFailureType,
  RateLimitInfo,
} from './ai/providers/types.js';
export { AiExtractionError, aiExtractionResponseSchema } from './ai/providers/types.js';
export { createAiProvider } from './ai/providers/factory.js';
export { buildPromptParts, truncateContent } from './ai/prompt.js';
export type { PromptParts, BuildPromptOptions } from './ai/prompt.js';
export { processDocument } from './ai/extract.js';
export type { AiRequestBudget, ProcessDocumentOptions } from './ai/extract.js';
export { processBatch } from './ai/batch.js';
export type { BatchProcessOptions } from './ai/batch.js';
export { reprocessSingleResult } from './ai/reprocess.js';
export type { ReprocessSingleResultOptions } from './ai/reprocess.js';
export { TpmThrottle } from './ai/tpm-throttle.js';
export type { TpmThrottleStatus } from './ai/tpm-throttle.js';
export {
  getAiResults,
  getAiResult,
  getAiInboxResult,
  getAiStats,
  clearAllAiResults,
  markAiResultApplied,
  markAiResultRejected,
  markAiResultFailed,
  batchMarkApplied,
  batchMarkRejected,
  getPendingAiResultIds,
  getAiResultIdsByFilter,
  getDocumentIdsByAiFilter,
  getUnprocessedDocuments,
  getUnprocessedDocumentFacets,
  listAiReviewInbox,
} from './ai/queries.js';
export type {
  AiFailureCategory,
  AiFailureGroup,
  AiInboxPage,
  AiInboxQuery,
  AiInboxQueue,
  AiSafeFailure,
  AiResultFilters,
  AiResultSummary,
  AiResultDetail,
  AiInboxResultDetail,
  AiStats,
  ApplySnapshot,
  UnprocessedDocument,
  UnprocessedDocumentFilters,
} from './ai/queries.js';
export { normalizeSuggestedLabel, normalizeSuggestedTags } from './ai/normalize.js';
export { discoverCustomFieldCandidates } from './ai/custom-field-discovery.js';
export type {
  CustomFieldCandidate,
  CustomFieldDiscoveryOptions,
  CustomFieldDiscoveryResult,
} from './ai/custom-field-discovery.js';
export {
  adaptCustomFieldDiscoveryV2ToLegacy,
  scanCustomFieldCandidatesV2,
} from './ai/custom-field-discovery-v2.js';
export type {
  CustomFieldCandidateV2,
  CustomFieldDiscoveryOptionsV2,
  CustomFieldDiscoveryRunV2,
  CustomFieldDiscoveryRiskV2,
  CustomFieldDiscoveryTruncationV2,
} from './ai/custom-field-discovery-v2.js';
export {
  beginCustomFieldDiscoveryRun,
  completeCustomFieldDiscoveryRun,
  createCustomFieldDiscoverySource,
  failCustomFieldDiscoveryRun,
  getLatestCustomFieldDiscoveryRun,
} from './ai/custom-field-discovery-store.js';
export type { PublicCustomFieldDiscoveryRun } from './ai/custom-field-discovery-store.js';
export { runCustomFieldDiscoveryOperation } from './ai/custom-field-discovery-operation.js';
export type {
  CustomFieldDiscoveryOperationSummary,
  CustomFieldDiscoveryTaskData,
  RunCustomFieldDiscoveryOperationOptions,
} from './ai/custom-field-discovery-operation.js';
export { normalizeCustomFieldRecommendations } from './ai/custom-fields.js';
export {
  CustomFieldPolicyError,
  getCustomFieldPolicy,
  replaceCustomFieldPolicy,
  resolveCustomFieldPolicy,
} from './ai/custom-field-policy.js';
export type {
  CustomFieldPolicyEntry,
  CustomFieldPolicyErrorCode,
  CustomFieldPolicySelection,
  ResolvedCustomField,
} from './ai/custom-field-policy.js';
export {
  applyAiResult,
  rejectAiResult,
  rejectAiResultWithReason,
  batchRejectAiResults,
} from './ai/apply.js';
export type { AiApplyField, ApplyOptions, ReferenceData } from './ai/apply.js';
export { createAiRevertPlan, executeClaimedAiRevertPlan, revertAiResult } from './ai/revert.js';
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
export {
  claimAiMutationPlan,
  computeApplyPreflight,
  createAiApplyPlan,
  executeClaimedAiApplyPlan,
} from './ai/preflight.js';
export type {
  AiMutationExecutionResult,
  AiMutationPlanPayload,
  AiMutationPlanPreview,
  ApplyPreflightResult,
  ClaimedAiMutationPlan,
} from './ai/preflight.js';
export {
  fetchAndCachePricing,
  refreshPricingIfStale,
  getModelPricing,
  getExactModelPricing,
  getAllModelPricing,
  estimateResultCost,
  estimateBatchCost,
  getCostStats,
  backfillCosts,
} from './ai/costs.js';
export type { ModelPricing, AiCostEstimate, AiCostStats } from './ai/costs.js';
export { estimateProcessingCost } from './ai/cost-estimate.js';
export type {
  DetailedCostEstimate,
  ModelCostEstimate,
  EstimateProcessingCostOptions,
} from './ai/cost-estimate.js';
export {
  AiBudgetExceededError,
  UnknownAiModelPricingError,
  abandonAiReservations,
  countAiPromptTokens,
  reconcileAiBudgetReservation,
  reserveAiBudget,
} from './ai/budget.js';
export type { AiBudgetReservationView } from './ai/budget.js';
export { clearAiResultHistory, replaceAiResultWithRevision } from './ai/history.js';
