import { z } from 'zod';

import type { DuplicateMatchExplanation } from '../dedup/explanations.js';
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
  totalMemberCount?: number;
  limit: number;
  offset: number;
}

// ── Duplicate Inbox ────────────────────────────────────────────────────

export const DUPLICATE_HIGH_CONFIDENCE_THRESHOLD = 0.95;

const duplicateInboxCursorPayloadSchema = z
  .object({
    confidenceScore: z.number().finite().min(0).max(1),
    createdAt: z.iso.datetime(),
    id: z.string().min(1),
  })
  .strict();

export type DuplicateInboxCursorPayload = z.infer<typeof duplicateInboxCursorPayloadSchema>;

export function encodeDuplicateInboxCursor(payload: DuplicateInboxCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeDuplicateInboxCursor(value: string): DuplicateInboxCursorPayload | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const result = duplicateInboxCursorPayloadSchema.safeParse(decoded);
    if (!result.success || encodeDuplicateInboxCursor(result.data) !== value) return null;
    return result.data;
  } catch {
    return null;
  }
}

export const duplicateInboxQuerySchema = z
  .object({
    queue: z
      .enum(['pending', 'high-confidence', 'ambiguous', 'ignored', 'deleted'])
      .default('pending'),
    correspondent: z.string().trim().min(1).max(200).optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    maxConfidence: z.coerce.number().min(0).max(1).optional(),
    cursor: z
      .string()
      .min(1)
      .max(1_000)
      .refine(
        (value) => decodeDuplicateInboxCursor(value) !== null,
        'Invalid duplicate inbox cursor',
      )
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    ({ minConfidence, maxConfidence }) =>
      minConfidence === undefined || maxConfidence === undefined || minConfidence <= maxConfidence,
    {
      path: ['maxConfidence'],
      message: 'Maximum confidence must be greater than or equal to minimum confidence',
    },
  );

export type DuplicateInboxQuery = z.infer<typeof duplicateInboxQuerySchema>;
export type DuplicateInboxQueue = DuplicateInboxQuery['queue'];

export interface DuplicateInboxQueueCounts {
  pending: number;
  highConfidence: number;
  ambiguous: number;
  ignored: number;
  deleted: number;
}

export interface DuplicateInboxPage {
  items: DuplicateGroupSummary[];
  nextCursor: string | null;
  counts: DuplicateInboxQueueCounts;
  query: DuplicateInboxQuery;
}

// ── Duplicate Group Filters ─────────────────────────────────────────────

export const duplicateGroupFiltersSchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  status: z
    .string()
    .transform((v) => v.split(',').filter((s) => GROUP_STATUS_VALUES.includes(s as GroupStatus)))
    .optional(),
  includeDeleted: z.coerce.boolean().optional(),
  sortBy: z
    .enum(['confidence', 'created_at', 'member_count', 'updated_at', 'status'])
    .default('confidence'),
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
  noAiResult: z.coerce.boolean().optional(),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

// ── Document Library ──────────────────────────────────────────────────

const documentLibraryCursorPayloadSchema = z
  .object({
    addedDate: z.iso.datetime().nullable(),
    paperlessId: z.number().int().positive(),
  })
  .strict();

export type DocumentLibraryCursorPayload = z.infer<typeof documentLibraryCursorPayloadSchema>;

export function encodeDocumentLibraryCursor(payload: DocumentLibraryCursorPayload): string {
  return Buffer.from(
    JSON.stringify(documentLibraryCursorPayloadSchema.parse(payload)),
    'utf8',
  ).toString('base64url');
}

export function decodeDocumentLibraryCursor(value: string): DocumentLibraryCursorPayload | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const result = documentLibraryCursorPayloadSchema.safeParse(decoded);
    if (!result.success || encodeDocumentLibraryCursor(result.data) !== value) return null;
    return result.data;
  } catch {
    return null;
  }
}

const optionalUrlBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1')
  .optional();

const paperlessCustomFieldValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.number().finite()),
  z.null(),
]);

export type PaperlessCustomFieldValue = z.infer<typeof paperlessCustomFieldValueSchema>;

const canonicalCustomFieldValueSchema = z
  .string()
  .min(1)
  .max(2_000)
  .transform((source, context): PaperlessCustomFieldValue => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid custom field JSON value' });
      return z.NEVER;
    }
    const result = paperlessCustomFieldValueSchema.safeParse(parsed);
    if (!result.success || JSON.stringify(result.data) !== source) {
      context.addIssue({ code: 'custom', message: 'Custom field value must be canonical JSON' });
      return z.NEVER;
    }
    return result.data;
  });

const exactMetadataValueSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), 'Metadata values must not have outer whitespace')
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 31 || code === 127;
      }),
    'Metadata values contain unsafe text',
  );

const canonicalExactMetadataSetSchema = z
  .string()
  .min(1)
  .max(2_100)
  .transform((source, context): string[] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid metadata set JSON' });
      return z.NEVER;
    }
    const result = z.array(exactMetadataValueSchema).min(1).max(10).safeParse(parsed);
    if (
      !result.success ||
      new Set(result.data).size !== result.data.length ||
      result.data.some((value, index) => index > 0 && result.data[index - 1] >= value) ||
      JSON.stringify(result.data) !== source
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Metadata sets must be canonical sorted unique JSON string arrays',
      });
      return z.NEVER;
    }
    return result.data;
  });

export const documentLibraryQuerySchema = z
  .object({
    text: z.string().trim().min(1).max(200).optional(),
    missingOcr: optionalUrlBooleanSchema,
    missingCorrespondent: optionalUrlBooleanSchema,
    missingDocumentType: optionalUrlBooleanSchema,
    missingTags: optionalUrlBooleanSchema,
    correspondent: z.string().trim().min(1).max(200).optional(),
    correspondentSet: canonicalExactMetadataSetSchema.optional(),
    documentType: z.string().trim().min(1).max(200).optional(),
    documentTypeSet: canonicalExactMetadataSetSchema.optional(),
    tag: z.string().trim().min(1).max(200).optional(),
    tagSet: canonicalExactMetadataSetSchema.optional(),
    customFieldId: z.coerce.number().int().positive().optional(),
    customFieldValue: canonicalCustomFieldValueSchema.optional(),
    duplicate: z.enum(['any', 'involved', 'not-involved']).default('any'),
    aiStatus: z
      .enum([
        'unprocessed',
        'pending_review',
        'applied',
        'partial',
        'reverted',
        'rejected',
        'failed',
        'skipped',
      ])
      .optional(),
    freshness: z.enum(['fresh', 'stale']).optional(),
    cursor: z
      .string()
      .min(1)
      .max(1_000)
      .refine(
        (value) => decodeDocumentLibraryCursor(value) !== null,
        'Invalid document library cursor',
      )
      .optional(),
    limit: z.coerce
      .number()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(50),
  })
  .strict()
  .refine(
    ({ customFieldId, customFieldValue }) =>
      customFieldValue === undefined || customFieldId !== undefined,
    {
      path: ['customFieldValue'],
      message: 'A custom field value requires a custom field ID',
    },
  )
  .superRefine((query, context) => {
    for (const [singleKey, setKey, missingKey] of [
      ['correspondent', 'correspondentSet', 'missingCorrespondent'],
      ['documentType', 'documentTypeSet', 'missingDocumentType'],
      ['tag', 'tagSet', 'missingTags'],
    ] as const) {
      const selected = [query[singleKey], query[setKey], query[missingKey]].filter(
        (value) => value !== undefined,
      );
      if (selected.length > 1) {
        context.addIssue({
          code: 'custom',
          path: [setKey],
          message: `Use only one ${singleKey} quality filter`,
        });
      }
    }
  });

export type DocumentLibraryQueryInput = z.input<typeof documentLibraryQuerySchema>;
export type DocumentLibraryQuery = z.output<typeof documentLibraryQuerySchema>;

export interface DocumentLibraryItem extends DocumentSummary {
  hasOcr: boolean;
  duplicateGroupCount: number;
  duplicateGroupId: string | null;
  duplicateGroupStatus: GroupStatus | null;
  aiStatus: string | null;
  aiFailureType: string | null;
  aiFreshness: 'fresh' | 'stale' | null;
}

export interface DocumentLibraryCounts {
  total: number;
  missingOcr: number;
  duplicateInvolved: number;
  aiUnprocessed: number;
  aiStale: number;
}

export interface DocumentLibraryPage {
  items: DocumentLibraryItem[];
  nextCursor: string | null;
  counts: DocumentLibraryCounts;
  query: DocumentLibraryQuery;
}

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
  discriminativeScore: number | null;
  status: string;
  memberCount: number;
  archivedMemberCount: number | null;
  primaryDocumentTitle: string | null;
  primaryPaperlessId: number | null;
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
  discriminativeScore: number | null;
  algorithmVersion: string;
  status: string;
  archivedMemberCount: number | null;
  archivedPrimaryTitle: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: DuplicateGroupMember[];
  matchExplanation: DuplicateMatchExplanation | null;
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
  analysisStale: boolean;
  analysisStaleReason: 'config_changed' | null;
  readiness: LocalReadiness;
  nextActions: NextAction[];
}

export type NextActionKind = 'retry' | 'sync' | 'analysis' | 'duplicate_review' | 'ai_review';

export interface NextAction {
  id: string;
  priority: number;
  kind: NextActionKind;
  title: string;
  detail: string;
  href: string;
  safeAction?: 'sync' | 'analysis' | 'retry';
}

export interface LocalReadiness {
  lastSyncAt: string | null;
  lastSyncDocumentCount: number | null;
  lastAnalysisAt: string | null;
  totalDuplicateGroups: number | null;
  analysisStale: boolean;
  analysisStaleReason: 'config_changed' | null;
  failedJobCount: number;
  pendingDuplicateGroups: number;
  pendingAiResults: number;
}

export interface PaperlessReadiness {
  status: 'connected' | 'unavailable';
  apiVersion: string | null;
}

export interface Readiness extends LocalReadiness {
  paperless: PaperlessReadiness;
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
