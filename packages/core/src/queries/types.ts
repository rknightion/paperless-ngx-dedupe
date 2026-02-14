import { z } from 'zod';

// ── Pagination ──────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Duplicate Group Filters ─────────────────────────────────────────────

export const duplicateGroupFiltersSchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  reviewed: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  resolved: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['confidence', 'created_at', 'member_count']).default('confidence'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type DuplicateGroupFilters = z.infer<typeof duplicateGroupFiltersSchema>;

// ── Document Filters ────────────────────────────────────────────────────

export const documentFiltersSchema = z.object({
  correspondent: z.string().optional(),
  documentType: z.string().optional(),
  tag: z.string().optional(),
  processingStatus: z.enum(['pending', 'completed']).optional(),
  search: z.string().optional(),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

// ── Domain Interfaces ───────────────────────────────────────────────────

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
    reviewed: boolean;
    resolved: boolean;
  }[];
}

export interface DuplicateGroupSummary {
  id: string;
  confidenceScore: number;
  jaccardSimilarity: number | null;
  fuzzyTextRatio: number | null;
  metadataSimilarity: number | null;
  filenameSimilarity: number | null;
  reviewed: boolean;
  resolved: boolean;
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
  reviewed: boolean;
  resolved: boolean;
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
  reviewedGroups: number;
  resolvedGroups: number;
  unresolvedGroups: number;
  confidenceDistribution: ConfidenceBucket[];
  topCorrespondents: { correspondent: string; groupCount: number }[];
}

export interface DashboardData {
  totalDocuments: number;
  unresolvedGroups: number;
  storageSavingsBytes: number;
  pendingAnalysis: number;
  lastSyncAt: string | null;
  lastSyncDocumentCount: number | null;
  lastAnalysisAt: string | null;
  totalDuplicateGroups: number | null;
  topCorrespondents: { correspondent: string; groupCount: number }[];
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
  documentsOverTime: { month: string; count: number }[];
  fileSizeDistribution: { bucket: string; count: number }[];
  wordCountDistribution: { bucket: string; count: number }[];
  unclassified: { noCorrespondent: number; noDocumentType: number; noTags: number };
  duplicateInvolvement: { documentsInGroups: number; percentage: number };
  largestDocuments: {
    id: string;
    paperlessId: number;
    title: string;
    correspondent: string | null;
    archiveFileSize: number;
  }[];
}

// ── Similarity Graph ────────────────────────────────────────────────────

export const similarityGraphFiltersSchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  reviewed: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  resolved: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  maxGroups: z.coerce.number().int().min(1).max(500).default(100),
});

export type SimilarityGraphFilters = z.infer<typeof similarityGraphFiltersSchema>;

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
  reviewed: boolean;
  resolved: boolean;
}

export interface SimilarityGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalGroupsMatched: number;
  groupsIncluded: number;
}
