export { PaperlessDedupeClient } from './client.js';
export {
  PaperlessDedupeError,
  PaperlessDedupeApiError,
  PaperlessDedupeNetworkError,
} from './errors.js';
export type {
  // SDK-specific
  ClientOptions,
  PaginationParams,
  PaginationMeta,
  ApiSuccessResponse,
  ApiErrorBody,
  ApiErrorResponse,
  SSECallbacks,
  SSESubscription,
  SSEProgressEvent,
  SSECompleteEvent,
  // Domain types
  DocumentSummary,
  DocumentDetail,
  DocumentStats,
  DocumentFilters,
  DuplicateGroupSummary,
  DuplicateGroupDetail,
  DuplicateGroupMember,
  DuplicateStats,
  DuplicateGroupFilters,
  ConfidenceBucket,
  GraphNode,
  GraphEdge,
  SimilarityGraphData,
  SimilarityGraphFilters,
  DashboardData,
  Job,
  SyncOptions,
  SyncResult,
  AnalysisResult,
  DedupConfig,
  ConfigBackup,
  BatchResult,
  BatchDeleteResult,
} from './types.js';
export { ErrorCode } from './types.js';
