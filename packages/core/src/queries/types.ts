import { z } from 'zod';

import type { GroupStatus } from '../types/enums.js';
import { GROUP_STATUS_VALUES } from '../types/enums.js';

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
  status: z
    .string()
    .transform((v) => v.split(',').filter((s) => GROUP_STATUS_VALUES.includes(s as GroupStatus)))
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

export interface DuplicateGroupSummary {
  id: string;
  confidenceScore: number;
  jaccardSimilarity: number | null;
  fuzzyTextRatio: number | null;
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

export interface DashboardData {
  totalDocuments: number;
  pendingGroups: number;
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
  averageWordCount: number;
  documentsOverTime: { month: string; count: number }[];
  wordCountDistribution: { bucket: string; count: number }[];
  unclassified: { noCorrespondent: number; noDocumentType: number; noTags: number };
  duplicateInvolvement: { documentsInGroups: number; percentage: number };
  usageStats: {
    cumulativeGroupsActioned: number;
    cumulativeDocumentsDeleted: number;
  };
}

// ── Similarity Graph ────────────────────────────────────────────────────

export const similarityGraphFiltersSchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  status: z
    .string()
    .transform((v) => v.split(',').filter((s) => GROUP_STATUS_VALUES.includes(s as GroupStatus)))
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
  status: string;
}

export interface SimilarityGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalGroupsMatched: number;
  groupsIncluded: number;
}
