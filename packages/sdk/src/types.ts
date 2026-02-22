// ── SDK-specific types ─────────────────────────────────────────────────

export interface ClientOptions {
  /** Base URL of the Paperless NGX Dedupe instance (e.g. "http://localhost:3000") */
  baseUrl: string;
  /** Optional custom fetch implementation for testing or environments without global fetch */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

// ── API envelope types ─────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown[];
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

// ── Error codes ────────────────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  NOT_READY: 'NOT_READY',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Document types ─────────────────────────────────────────────────────

export interface DocumentSummary {
  id: string;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  createdDate: string | null;
  addedDate: string | null;
  processingStatus: string | null;
  originalFileSize: number | null;
  archiveFileSize: number | null;
}

export interface DocumentDetail extends DocumentSummary {
  modifiedDate: string | null;
  fingerprint: string | null;
  syncedAt: string;
  content: {
    fullText: string | null;
    normalizedText: string | null;
    wordCount: number | null;
    contentHash: string | null;
  } | null;
  groupMemberships: {
    groupId: string;
    confidenceScore: number;
    isPrimary: boolean;
    status: string;
  }[];
}

export interface DocumentStats {
  totalDocuments: number;
  ocrCoverage: { withContent: number; withoutContent: number; percentage: number };
  processingStatus: { pending: number; completed: number };
  correspondentDistribution: { name: string; count: number }[];
  documentTypeDistribution: { name: string; count: number }[];
  tagDistribution: { name: string; count: number }[];
  totalStorageBytes: number;
  averageWordCount: number;
}

export interface DocumentFilters {
  correspondent?: string;
  documentType?: string;
  tag?: string;
  processingStatus?: 'pending' | 'completed';
  search?: string;
}

// ── Duplicate group types ──────────────────────────────────────────────

export interface DuplicateGroupSummary {
  id: string;
  confidenceScore: number;
  status: string;
  memberCount: number;
  primaryDocumentTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateGroupMember {
  memberId: string;
  documentId: string;
  isPrimary: boolean;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  createdDate: string | null;
  originalFileSize: number | null;
  archiveFileSize: number | null;
  content: {
    fullText: string | null;
    wordCount: number | null;
  } | null;
}

export interface DuplicateGroupDetail {
  id: string;
  confidenceScore: number;
  jaccardSimilarity: number | null;
  fuzzyTextRatio: number | null;
  metadataSimilarity: number | null;
  filenameSimilarity: number | null;
  algorithmVersion: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  members: DuplicateGroupMember[];
}

export interface ConfidenceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface DuplicateStats {
  totalGroups: number;
  pendingGroups: number;
  falsePositiveGroups: number;
  ignoredGroups: number;
  deletedGroups: number;
  confidenceDistribution: ConfidenceBucket[];
  topCorrespondents: { correspondent: string; groupCount: number }[];
}

export interface DuplicateGroupFilters {
  minConfidence?: number;
  maxConfidence?: number;
  status?: string;
  sortBy?: 'confidence' | 'created_at' | 'member_count';
  sortOrder?: 'asc' | 'desc';
}

// ── Similarity graph types ─────────────────────────────────────────────

export interface GraphNode {
  id: string;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  groupCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  groupId: string;
  confidenceScore: number;
  status: string;
}

export interface SimilarityGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalGroupsMatched: number;
  groupsIncluded: number;
}

export interface SimilarityGraphFilters {
  minConfidence?: number;
  maxConfidence?: number;
  status?: string;
  maxGroups?: number;
}

// ── Dashboard types ────────────────────────────────────────────────────

export interface DashboardData {
  totalDocuments: number;
  pendingGroups: number;
  storageSavingsBytes: number;
  pendingAnalysis: number;
  lastSyncAt: string | null;
  lastSyncDocumentCount: number | null;
  lastAnalysisAt: string | null;
  totalDuplicateGroups: number | null;
  topCorrespondents: { correspondent: string; groupCount: number }[];
}

// ── Job types ──────────────────────────────────────────────────────────

export interface Job {
  id: string;
  type: string;
  status: string | null;
  progress: number | null;
  progressMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  resultJson: string | null;
  createdAt: string;
}

// ── Sync types ─────────────────────────────────────────────────────────

export interface SyncResult {
  totalFetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
  syncType: 'full' | 'incremental';
}

// ── Analysis types ─────────────────────────────────────────────────────

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

// ── Dedup config types ─────────────────────────────────────────────────

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

// ── Export/Import types ────────────────────────────────────────────────

export interface ConfigBackup {
  version: string;
  exportedAt: string;
  appConfig: Record<string, string>;
  dedupConfig: DedupConfig;
}

// ── Batch operation types ──────────────────────────────────────────────

export interface BatchResult {
  processed: number;
}

export interface BatchDeleteResult {
  processed: number;
  deleted: number;
}

// ── SSE types ──────────────────────────────────────────────────────────

export interface SSEProgressEvent {
  progress: number;
  phaseProgress?: number;
  message?: string;
}

export interface SSECompleteEvent {
  status: string;
  result?: unknown;
}

export interface SSECallbacks {
  onProgress?: (data: SSEProgressEvent) => void;
  onComplete?: (data: SSECompleteEvent) => void;
  onError?: (error: Error) => void;
}

export interface SSESubscription {
  unsubscribe: () => void;
}
