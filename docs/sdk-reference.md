---
title: SDK Reference
description: TypeScript SDK for the Paperless NGX Dedupe API (current state and known limitations)
---

# SDK Reference

`@paperless-dedupe/sdk` is currently **pre-1.0 / experimental**.

Use this page as the source of truth for current behavior.

## Installation

```bash
pnpm --filter @paperless-dedupe/sdk build
```

Workspace usage:

```json
{
  "dependencies": {
    "@paperless-dedupe/sdk": "workspace:*"
  }
}
```

## Quick Start

```ts
import { PaperlessDedupeClient } from '@paperless-dedupe/sdk';

const client = new PaperlessDedupeClient({
  baseUrl: 'http://localhost:3000',
});

const health = await client.health();
console.log(health.status); // ok

const job = await client.sync();
client.subscribeToJobProgress(job.id, {
  onProgress: (e) => console.log(e.progress, e.message), // progress is 0..1
  onComplete: (e) => console.log(e.status),
  onError: (err) => console.error(err),
});
```

## Client Options

```ts
interface ClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeout?: number; // default 30000
}
```

## Methods

### Health & Readiness

- `health(): Promise<{ status: string }>` -- liveness check
- `ready(): Promise<{ status: string }>` -- readiness check

### Sync & Analysis

- `sync(options?: SyncOptions): Promise<Job>` -- trigger a sync job
- `analyze(): Promise<Job>` -- trigger an analysis job

### Documents

- `listDocuments(params?: PaginationParams & DocumentFilters): Promise<{ data: DocumentSummary[]; meta: PaginationMeta }>`
- `getDocument(id: string): Promise<DocumentDetail>`
- `getDocumentContent(id: string): Promise<{ fullText: string | null }>`
- `getDocumentStats(): Promise<DocumentStats>`

### Duplicate Groups

- `listDuplicates(params?: PaginationParams & DuplicateGroupFilters): Promise<{ data: DuplicateGroupSummary[]; meta: PaginationMeta }>`
- `getDuplicate(id: string): Promise<DuplicateGroupDetail>`
- `getDuplicateStats(): Promise<DuplicateStats>`
- `getDuplicateGraph(params?: SimilarityGraphFilters): Promise<SimilarityGraphData>`
- `setPrimary(groupId: string, documentId: string): Promise<DuplicateGroupDetail>`
- `setGroupStatus(groupId: string, status: string): Promise<{ groupId: string; status: string }>`
- `deleteDuplicate(groupId: string): Promise<void>`

### Batch Operations

- `batchSetStatus(groupIds: string[], status: string): Promise<BatchResult>`
- `batchDeleteNonPrimary(groupIds: string[], confirm: boolean): Promise<BatchDeleteResult>`
- `purgeDeletedGroups(): Promise<{ purged: number }>` -- permanently remove groups with `deleted` status

### Dashboard

- `getDashboard(): Promise<DashboardData>`

### App Config

- `getConfig(): Promise<Record<string, string>>`
- `updateConfig(settings: Record<string, string>): Promise<Record<string, string>>`

### Dedup Config

- `getDedupConfig(): Promise<DedupConfig>`
- `updateDedupConfig(config: Partial<DedupConfig>): Promise<DedupConfig>`
- `recalculateDedupConfig(): Promise<Job>`

### Jobs & SSE

- `getJob(jobId: string): Promise<Job>`
- `subscribeToJobProgress(jobId: string, callbacks: SSECallbacks): SSESubscription`

### Export / Import

- `exportDuplicatesCsv(params?: DuplicateGroupFilters): Promise<string>` -- returns raw CSV text
- `exportConfig(): Promise<ConfigBackup>`
- `importConfig(backup: ConfigBackup): Promise<ConfigBackup>`

### AI Processing

- `processAi(options?: AiProcessOptions): Promise<Job>` -- trigger AI classification
- `getAiResults(params?: PaginationParams & AiResultFilters): Promise<{ data: AiResultSummary[]; meta: PaginationMeta }>`
- `getAiResult(id: string): Promise<AiResultDetail>`
- `applyAiResult(id: string, options?: AiApplyOptions): Promise<void>` -- apply a single AI suggestion to Paperless
- `rejectAiResult(id: string): Promise<void>`
- `batchApplyAiResults(resultIds: string[], fields?: ('correspondent' | 'documentType' | 'tags')[]): Promise<Job>`
- `batchRejectAiResults(resultIds: string[]): Promise<void>`
- `applyAllAiResults(options?: AiApplyOptions): Promise<Job>` -- apply all pending AI suggestions
- `preflightApply(scope: ApplyScope, options?: AiApplyOptions): Promise<ApplyPreflightResult>` -- dry-run to preview what would change
- `getAiResultGroups(groupBy: GroupByField, filters?: AiResultFilters): Promise<{ groups: AiResultGroup[] }>`
- `getAiStats(): Promise<AiStats>`
- `getAiConfig(): Promise<AiConfig>`
- `updateAiConfig(config: Partial<AiConfig>): Promise<AiConfig>`

### AI Revert

- `revertAiResult(id: string): Promise<void>` -- undo a previously applied AI suggestion
- `rejectAiResultWithReason(id: string, reason?: string): Promise<void>` -- reject with an optional reason string

### AI Feedback

- `submitAiFeedback(resultId: string, feedback: AiFeedback): Promise<void>` -- record user feedback on a result
- `getAiFeedbackSummary(): Promise<AiFeedbackSummary>` -- aggregated feedback statistics

### AI Costs

- `getAiCosts(days?: number): Promise<AiCostStats>` -- cost breakdown, optionally scoped to recent N days
- `estimateAiCost(documentCount: number): Promise<AiCostEstimate>` -- estimate cost before processing

### Known Limitations / Legacy Mappings

These methods exist in the SDK but target routes or type shapes that may not match the server:

- `getDocumentContent(id)` -- calls `/api/v1/documents/:id/content` (not implemented by server)
- `batchSetStatus(groupIds, status)` -- server responds with `{ updated }`, while SDK `BatchResult` expects `{ processed }`
- `batchDeleteNonPrimary(groupIds, confirm)` -- server responds with `{ jobId }` (async background job), while SDK `BatchDeleteResult` expects `{ processed, deleted }`
- `getDedupConfig()` / `updateDedupConfig(config)` / `recalculateDedupConfig()` -- use legacy `/api/v1/dedup-config*` paths (current API uses `/api/v1/config/dedup`)
- `exportConfig()` -- uses `/api/v1/export/config` (current API endpoint is `/api/v1/export/config.json`)
- `importConfig(backup)` -- runtime API returns `{ appConfigKeys, dedupConfigUpdated }`, while SDK return type is `ConfigBackup`

For these operations, call the REST API directly for now (see [API Reference](api-reference.md)).

## Key Types

### Pagination

```ts
interface PaginationParams {
  limit?: number;
  offset?: number;
}

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}
```

### Jobs

```ts
interface Job {
  id: string;
  type: string;
  status: string | null;
  progress: number | null; // 0..1
  progressMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  resultJson: string | null;
  createdAt: string;
}

interface SyncOptions {
  force?: boolean;   // full sync instead of incremental
  purge?: boolean;   // purge all local data before syncing (implies full)
}
```

### Dedup Config

```ts
interface DedupConfig {
  numPermutations: number;
  numBands: number;
  ngramSize: number;
  minWords: number;
  similarityThreshold: number;
  confidenceWeightJaccard: number;
  confidenceWeightFuzzy: number;
  /** @deprecated Use discriminativePenaltyStrength instead. */
  confidenceWeightDiscriminative?: number;
  discriminativePenaltyStrength?: number;
  fuzzySampleSize: number;
  autoAnalyze: boolean;
}
```

The dedup scoring model uses two confidence weights (`confidenceWeightJaccard` + `confidenceWeightFuzzy`, summing to 100) plus an independent `discriminativePenaltyStrength` (0--100, default 70) that penalizes pairs sharing a template but differing in dates, amounts, invoice numbers, or routes. The old `confidenceWeightDiscriminative` field is deprecated and accepted only for backward compatibility.

### AI Types

```ts
interface AiConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  promptTemplate: string;
  maxContentLength: number;
  batchSize: number;
  rateDelayMs: number;
  autoProcess: boolean;
  processedTagName: string;
  addProcessedTag: boolean;
  includeCorrespondents: boolean;
  includeDocumentTypes: boolean;
  includeTags: boolean;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  maxRetries?: number;

  // Confidence gates
  confidenceThresholdGlobal?: number;
  confidenceThresholdCorrespondent?: number;
  confidenceThresholdDocumentType?: number;
  confidenceThresholdTags?: number;
  neverAutoCreateEntities?: boolean;
  neverOverwriteNonEmpty?: boolean;
  tagsOnlyAutoApply?: boolean;

  // Auto-apply rules
  autoApplyEnabled?: boolean;
  autoApplyRequireAllAboveThreshold?: boolean;
  autoApplyRequireNoNewEntities?: boolean;
  autoApplyRequireNoClearing?: boolean;
  autoApplyRequireOcrText?: boolean;
}

interface AiFeedback {
  action: 'rejected' | 'corrected' | 'partial_applied';
  rejectedFields?: ('correspondent' | 'documentType' | 'tags')[];
  corrections?: {
    correspondent?: { suggested: string | null; corrected: string | null };
    documentType?: { suggested: string | null; corrected: string | null };
    tags?: { suggested: string[]; corrected: string[] };
  };
  reason?: string;
}

interface AiCostStats {
  totalCostUsd: number;
  costByProvider: { provider: string; costUsd: number; tokenCount: number }[];
  costByModel: { model: string; costUsd: number; promptTokens: number; completionTokens: number }[];
  costOverTime: { date: string; costUsd: number; documentCount: number }[];
}

interface AiCostEstimate {
  estimatedCostUsd: number;
  breakdown: { input: number; output: number };
}

type ProcessScope =
  | { type: 'new_only' }
  | { type: 'failed_only' }
  | { type: 'selected_document_ids'; documentIds: string[] }
  | { type: 'current_filter'; filters: AiResultFilters }
  | { type: 'full_reprocess' };

type ApplyScope =
  | { type: 'selected_result_ids'; resultIds: string[] }
  | { type: 'all_pending' }
  | { type: 'current_filter'; filters: AiResultFilters };

type GroupByField =
  | 'suggestedCorrespondent'
  | 'suggestedDocumentType'
  | 'failureType'
  | 'confidenceBand';
```

### Type Drift

Current notable drift in SDK-exported types vs live API:

- `BatchResult` is typed as `{ processed: number }`, but API returns `{ updated: number }`.
- `BatchDeleteResult` is typed as `{ processed: number; deleted: number }`, but API returns `{ jobId: string }` and you must track progress via jobs endpoints/SSE.

## Error Handling

All SDK errors extend `PaperlessDedupeError`:

- **`PaperlessDedupeApiError`** -- HTTP error from the server (has `status`, `code`, `message`, `details`)
- **`PaperlessDedupeNetworkError`** -- connection/timeout failure (has `message`, `cause`)

```ts
import {
  PaperlessDedupeError,
  PaperlessDedupeApiError,
  PaperlessDedupeNetworkError,
} from '@paperless-dedupe/sdk';

try {
  await client.sync();
} catch (err) {
  if (err instanceof PaperlessDedupeApiError) {
    console.log(err.status, err.code, err.message, err.details);
  } else if (err instanceof PaperlessDedupeNetworkError) {
    console.log(err.message, err.cause);
  }
}
```

The `ErrorCode` constant provides well-known server error codes:

```ts
import { ErrorCode } from '@paperless-dedupe/sdk';
// ErrorCode.NOT_FOUND, ErrorCode.VALIDATION_FAILED,
// ErrorCode.CONFLICT, ErrorCode.JOB_ALREADY_RUNNING, etc.
```

## SSE Progress

`subscribeToJobProgress(jobId, callbacks)` opens `GET /api/v1/jobs/:jobId/progress` as a Server-Sent Events stream. It returns an `SSESubscription` with an `unsubscribe()` method to close the connection.

**Callbacks:**

- `onProgress(data: SSEProgressEvent)` -- fires on each `progress` SSE event
- `onComplete(data: SSECompleteEvent)` -- fires on the `complete` SSE event
- `onError(error: Error)` -- fires on network/stream errors

**Event types:**

```ts
interface SSEProgressEvent {
  progress: number;        // fractional 0..1, not percentage
  phaseProgress?: number;  // progress within the current phase
  message?: string;
}

interface SSECompleteEvent {
  status: string;
  result?: unknown;
}

interface SSESubscription {
  unsubscribe: () => void;
}
```
