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

### Generally Usable Today

- `health()`
- `ready()`
- `sync()`
- `analyze()`
- `listDocuments(params?)`
- `getDocument(id)`
- `getDocumentStats()`
- `listDuplicates(params?)`
- `getDuplicate(id)`
- `getDuplicateStats()`
- `getDuplicateGraph(params?)`
- `setGroupStatus(groupId, status)`
- `deleteDuplicate(groupId)`
- `getDashboard()`
- `getConfig()`
- `updateConfig(settings)`
- `getJob(jobId)`
- `subscribeToJobProgress(jobId, callbacks)`
- `exportDuplicatesCsv(params?)`

### Known Limitations / Legacy Mappings

These methods exist in the SDK but currently target routes or method semantics that do not match the server:

- `getDocumentContent(id)`
  - Calls `/api/v1/documents/:id/content` (not implemented by server)
- `setPrimary(groupId, documentId)`
  - Sends `POST` but server expects `PUT /api/v1/duplicates/:id/primary`
- `batchSetStatus(groupIds, status)`
  - Server responds with `{ updated }`, while SDK `BatchResult` expects `{ processed }`
- `batchDeleteNonPrimary(groupIds, confirm)`
  - Server responds with `{ jobId }` (async background job), while SDK `BatchDeleteResult` expects `{ processed, deleted }`
- `getDedupConfig()`
- `updateDedupConfig(config)`
- `recalculateDedupConfig()`
  - Use legacy `/api/v1/dedup-config*` paths (current API uses `/api/v1/config/dedup`)
- `exportConfig()`
  - Uses `/api/v1/export/config` (current API endpoint is `/api/v1/export/config.json`)
- `importConfig(backup)`
  - Runtime API returns `{ appConfigKeys, dedupConfigUpdated }`, while SDK return type is currently `ConfigBackup`

For these operations, call the REST API directly for now (see [API Reference](api-reference.md)).

## Key Types

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
```

Current notable drift in SDK-exported types vs live API:

- `BatchResult` is typed as `{ processed: number }`, but API returns `{ updated: number }`.
- `BatchDeleteResult` is typed as `{ processed: number; deleted: number }`, but API returns `{ jobId: string }` and you must track progress via jobs endpoints/SSE.

## Error Handling

```ts
import {
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

## SSE Progress

`subscribeToJobProgress(jobId, callbacks)` opens `GET /api/v1/jobs/:jobId/progress` and emits:

- `onProgress({ progress, message, status })`
- `onComplete({ progress, message, status })`
- `onError(error)`

`progress` is fractional (`0..1`), not percentage.
