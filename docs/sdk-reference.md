---
title: SDK Reference
description: TypeScript SDK for the Paperless-Dedupe REST API — client library, types, and error handling
---

# SDK Reference

The `@paperless-dedupe/sdk` package provides a typed TypeScript client for the Paperless-Dedupe REST API.

## Installation

The SDK is not yet published to npm. Install from the monorepo:

```bash
# From the monorepo root
pnpm --filter @paperless-dedupe/sdk build
```

Or reference it directly in your `package.json`:

```json
{
  "dependencies": {
    "@paperless-dedupe/sdk": "workspace:*"
  }
}
```

## Quick Start

```typescript
import { PaperlessDedupeClient } from '@paperless-dedupe/sdk';

const client = new PaperlessDedupeClient({
  baseUrl: 'http://localhost:3000',
});

// Check health
const health = await client.health();
console.log(health.status); // "ok"

// Trigger sync and monitor progress
const job = await client.sync();
client.subscribeToJobProgress(job.id, {
  onProgress: (data) => console.log(`${data.progress}% - ${data.message}`),
  onComplete: (data) => console.log(`Done: ${data.status}`),
  onError: (err) => console.error(err),
});

// List high-confidence pending duplicates
const { data: groups, meta } = await client.listDuplicates({
  minConfidence: 0.9,
  status: 'pending',
  limit: 10,
});
console.log(`${meta.total} pending groups above 90%`);
```

## Client Options

```typescript
interface ClientOptions {
  /** Base URL of the Paperless-Dedupe instance (e.g. "http://localhost:3000") */
  baseUrl: string;
  /** Optional custom fetch implementation for testing or non-browser environments */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}
```

## Methods

### Health

| Method | Returns | Description |
|--------|---------|-------------|
| `health()` | `{ status: string }` | Basic health check |
| `ready()` | `{ status: string }` | Deep readiness check (DB + Paperless connectivity) |

### Sync & Analysis

| Method | Returns | Description |
|--------|---------|-------------|
| `sync()` | `Job` | Trigger document sync from Paperless-NGX |
| `analyze()` | `Job` | Trigger deduplication analysis |

### Documents

| Method | Returns | Description |
|--------|---------|-------------|
| `listDocuments(params?)` | `{ data: DocumentSummary[], meta: PaginationMeta }` | List documents with filters and pagination |
| `getDocument(id)` | `DocumentDetail` | Get full document details including content |
| `getDocumentContent(id)` | `{ fullText: string \| null }` | Get document text content |
| `getDocumentStats()` | `DocumentStats` | Aggregate document statistics |

**Filter parameters for `listDocuments`:**

```typescript
interface DocumentFilters {
  correspondent?: string;
  documentType?: string;
  tag?: string;
  processingStatus?: 'pending' | 'completed';
  search?: string;
}
```

### Duplicate Groups

| Method | Returns | Description |
|--------|---------|-------------|
| `listDuplicates(params?)` | `{ data: DuplicateGroupSummary[], meta: PaginationMeta }` | List groups with filters |
| `getDuplicate(id)` | `DuplicateGroupDetail` | Full group details with members |
| `getDuplicateStats()` | `DuplicateStats` | Aggregate group statistics |
| `getDuplicateGraph(params?)` | `SimilarityGraphData` | Similarity graph (nodes + edges) |
| `setPrimary(groupId, documentId)` | `DuplicateGroupDetail` | Set the primary document |
| `setGroupStatus(groupId, status)` | `{ groupId, status }` | Set group status (`pending`, `false_positive`, `ignored`, `deleted`) |
| `deleteDuplicate(groupId)` | `void` | Delete a group (not the documents) |

**Filter parameters for `listDuplicates`:**

```typescript
interface DuplicateGroupFilters {
  minConfidence?: number;
  maxConfidence?: number;
  status?: string;
  sortBy?: 'confidence' | 'created_at' | 'member_count';
  sortOrder?: 'asc' | 'desc';
}
```

### Batch Operations

| Method | Returns | Description |
|--------|---------|-------------|
| `batchSetStatus(groupIds, status)` | `BatchResult` | Set status for multiple groups |
| `batchDeleteNonPrimary(groupIds, confirm)` | `BatchDeleteResult` | Delete non-primary documents from Paperless-NGX |

!!! danger "Destructive"
    `batchDeleteNonPrimary` permanently removes documents from Paperless-NGX. The `confirm` parameter must be `true`.

### Dashboard

| Method | Returns | Description |
|--------|---------|-------------|
| `getDashboard()` | `DashboardData` | Summary statistics for the dashboard |

### Configuration

| Method | Returns | Description |
|--------|---------|-------------|
| `getConfig()` | `Record<string, string>` | Get all config key-value pairs |
| `updateConfig(settings)` | `Record<string, string>` | Update config settings |
| `getDedupConfig()` | `DedupConfig` | Get dedup algorithm configuration |
| `updateDedupConfig(config)` | `DedupConfig` | Update dedup configuration (partial) |
| `recalculateDedupConfig()` | `Job` | Recalculate all group scores |

### Jobs

| Method | Returns | Description |
|--------|---------|-------------|
| `getJob(jobId)` | `Job` | Get job details |
| `subscribeToJobProgress(jobId, callbacks)` | `SSESubscription` | Subscribe to real-time progress |

### Export & Import

| Method | Returns | Description |
|--------|---------|-------------|
| `exportDuplicatesCsv(params?)` | `string` | Export duplicates as CSV text |
| `exportConfig()` | `ConfigBackup` | Export configuration backup |
| `importConfig(backup)` | `ConfigBackup` | Import configuration backup |

## Types

### Core Types

```typescript
interface Job {
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

interface DedupConfig {
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

### Document Types

```typescript
interface DocumentSummary {
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

interface DocumentDetail extends DocumentSummary {
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
```

### Duplicate Group Types

```typescript
interface DuplicateGroupSummary {
  id: string;
  confidenceScore: number;
  status: string;
  memberCount: number;
  primaryDocumentTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DuplicateGroupDetail {
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
```

## Error Handling

The SDK provides typed error classes:

```typescript
import {
  PaperlessDedupeError,
  PaperlessDedupeApiError,
  PaperlessDedupeNetworkError,
} from '@paperless-dedupe/sdk';

try {
  await client.sync();
} catch (error) {
  if (error instanceof PaperlessDedupeApiError) {
    // Server returned an error response
    console.log(error.status);  // HTTP status code (e.g., 409)
    console.log(error.code);    // Error code (e.g., "JOB_ALREADY_RUNNING")
    console.log(error.message); // Human-readable message
    console.log(error.details); // Optional Zod validation details
  } else if (error instanceof PaperlessDedupeNetworkError) {
    // Network or connection failure
    console.log(error.message); // e.g., "fetch failed"
    console.log(error.cause);   // Underlying error
  }
}
```

**Error hierarchy:**

- `PaperlessDedupeError` -- Base error class
    - `PaperlessDedupeApiError` -- Server returned an error (has `status`, `code`, `details`)
    - `PaperlessDedupeNetworkError` -- Network failure (has `cause`)

## SSE Subscriptions

Monitor job progress in real-time:

```typescript
const job = await client.sync();

const subscription = client.subscribeToJobProgress(job.id, {
  onProgress: (data) => {
    // data.progress: number (0-100)
    // data.message: string | undefined
    console.log(`${data.progress}% - ${data.message}`);
  },
  onComplete: (data) => {
    // data.status: string ("completed" | "failed" | "cancelled")
    // data.result: unknown | undefined
    console.log(`Job ${data.status}`);
  },
  onError: (error) => {
    console.error('SSE error:', error);
  },
});

// Unsubscribe when done
subscription.unsubscribe();
```

## Custom Fetch

Provide a custom `fetch` implementation for testing or environments without global `fetch`:

```typescript
import { PaperlessDedupeClient } from '@paperless-dedupe/sdk';

// Example: using node-fetch or a mock
const client = new PaperlessDedupeClient({
  baseUrl: 'http://localhost:3000',
  fetch: myCustomFetch,
  timeout: 60_000, // 60 second timeout
});
```
