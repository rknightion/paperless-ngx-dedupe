---
title: API Reference
description: Use the Paperless NGX Dedupe REST API for synchronization, duplicate analysis, AI processing, configuration, and review.
---

# API Reference

Paperless NGX Dedupe exposes a REST API covering sync, analysis, duplicates, AI processing, and configuration — everything the web UI does, automatable via HTTP.

Base path: `/api/v1`

## Conventions

### Standard Envelope

Most endpoints return:

```json
{
  "data": {},
  "meta": {}
}
```

- `meta` is optional (pagination, recalculation counts, etc.).

Errors return:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "operation": "api_request",
    "retryable": false,
    "occurredAt": "2026-01-01T00:00:00.000Z",
    "correlationId": "example-request",
    "validationIssues": [{ "path": ["limit"], "message": "Validation failed" }]
  }
}
```

- `code` is one of the error codes below.
- `message` is fixed text for the code, not a request-specific explanation.
- `operation` is a short machine name, defaulting to `api_request` when the route sets none.
- `retryable` is a boolean, defaulting to true for HTTP 408, 429 and 5xx responses.
- `occurredAt` is an ISO 8601 UTC timestamp.
- `correlationId` is optional.
- `validationIssues` is an optional array of `{ path, message }` on validation failures;
  each `path` is an array of strings and each `message` is a sanitized string.

The fixed messages and validation issue contract are defined in
`packages/core/src/contracts/api.ts`. The legacy `apiError(code, 'text')` form discards
its message string; new code should use the context form described in `AGENTS.md`.

### Endpoints That Do Not Use the Envelope

- `GET /api/v1/jobs/:jobId/progress` (SSE stream)
- `GET /api/v1/export/duplicates.csv` (raw CSV download)
- `GET /api/v1/export/config.json` (raw JSON download)
- `GET /api/v1/paperless/documents/:paperlessId/preview` (proxied binary stream)
- `GET /api/v1/paperless/documents/:paperlessId/thumb` (proxied binary stream)
- `GET /api/v1/metrics` (Prometheus text exposition format)

### Error Codes

| Code | Status | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Invalid path/query input |
| `VALIDATION_FAILED` | 400 | Invalid request body or params |
| `UNAUTHORIZED` | 401 | Auth failed/missing |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | State conflict |
| `JOB_ALREADY_RUNNING` | 409 | Same-type job already running/pending |
| `BAD_GATEWAY` | 502 | Upstream Paperless request failed |
| `NOT_READY` | 503 | Readiness checks failed |
| `SERVICE_UNAVAILABLE` | 503 | The server is shutting down or its runtime is not accepting work; retry |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Pagination

Common pagination params:

| Param | Default | Range |
| --- | --- | --- |
| `limit` | `50` | `1..100` |
| `offset` | `0` | `>=0` |

`GET /api/v1/jobs` uses `limit` range `1..200`.

## Health

### GET /api/v1/health

Returns process liveness.

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2026-02-15T10:00:00.000Z"
  }
}
```

### GET /api/v1/ready

Returns readiness checks (database + Paperless reachability).

```json
{
  "data": {
    "status": "ready",
    "checks": {
      "database": { "status": "ok" },
      "paperless": { "status": "ok" }
    }
  }
}
```

If any check fails, returns HTTP 503 with `NOT_READY`.

### GET /api/v1/metrics

Returns application metrics in [Prometheus exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/). Requires `OTEL_PROMETHEUS_ENABLED=true`.

Returns `404` with a text message when the feature is not enabled.

Content-Type: `text/plain; version=0.0.4; charset=utf-8`

Only server-thread metrics are exposed; worker sync, analysis and AI processing metrics require `OTEL_ENABLED=true` with OTLP and are absent from this endpoint even when both pipelines are enabled. See [Configuration > Prometheus Scrape Endpoint](configuration.md#prometheus-scrape-endpoint-optional) for the metric families and setup details.

## Dashboard

### GET /api/v1/dashboard

Returns summary cards and top correspondents.

## Sync and Analysis

### POST /api/v1/sync

Starts sync job.

Optional JSON body:

```json
{ "force": true }
```

Response (202):

```json
{ "data": { "jobId": "..." } }
```

### GET /api/v1/sync/status

Returns last sync metadata plus active sync job status.

### POST /api/v1/analysis

Starts analysis job.

Optional JSON body:

```json
{ "force": true }
```

Response (202):

```json
{ "data": { "jobId": "..." } }
```

### GET /api/v1/analysis/status

Returns last analysis metadata plus active analysis job status.

## Jobs

### GET /api/v1/jobs

List jobs.

Query params:

- `type`: `sync | analysis | batch_operation`
- `status`: `pending | running | completed | failed | cancelled`
- `limit`: `1..200`

### GET /api/v1/jobs/:jobId

Get one job.

Job object fields:

```json
{
  "id": "...",
  "type": "sync",
  "status": "running",
  "progress": 0.42,
  "progressMessage": "...",
  "startedAt": "...",
  "completedAt": null,
  "errorMessage": null,
  "resultJson": null,
  "createdAt": "..."
}
```

`progress` is `0..1`.

### GET /api/v1/jobs/:jobId/progress

SSE stream.

Events:

- `progress`
- `complete`

Event data shape:

```json
{
  "progress": 0.42,
  "message": "...",
  "status": "running"
}
```

### POST /api/v1/jobs/:jobId/cancel

Cancels a pending/running job.

```json
{ "data": { "jobId": "...", "status": "cancelled" } }
```

## Configuration

### GET /api/v1/config

Returns mutable app config key/value map from DB. Environment-owned Paperless connection settings
and credential keys are omitted.

### PUT /api/v1/config

Accepts either:

```json
{ "key": "some.key", "value": "some-value" }
```

or:

```json
{ "settings": { "some.key": "value", "another.key": "value" } }
```

Returns the safe mutable config map. Credential and environment-owned connection keys are ignored.

### POST /api/v1/config/test-connection

Tests Paperless connectivity using the runtime environment configuration. The endpoint does not
accept a request body, preventing browser-supplied connection credentials from entering server
state or diagnostics.

Success:

```json
{
  "data": {
    "connected": true,
    "version": "2.x",
    "documentCount": 1234
  }
}
```

### GET /api/v1/config/dedup

Returns effective dedup config.

### PUT /api/v1/config/dedup

Updates dedup config (partial).

- Requires `Content-Type: application/json`
- `confidenceWeightJaccard` + `confidenceWeightFuzzy` must sum to 100
- `discriminativePenaltyStrength` is independent (0..100)

If weight or penalty keys change, `meta.recalculatedGroups` is included. If any LSH/threshold parameters change in a way that makes the current analysis stale, `meta.analysisStale` is included.

Legacy field name `confidenceWeightDiscriminative` is accepted and automatically converted to `discriminativePenaltyStrength`.

```json
{
  "data": {
    "numPermutations": 256,
    "numBands": 32,
    "ngramSize": 3,
    "minWords": 20,
    "similarityThreshold": 0.75,
    "confidenceWeightJaccard": 60,
    "confidenceWeightFuzzy": 40,
    "discriminativePenaltyStrength": 70,
    "fuzzySampleSize": 10000,
    "autoAnalyze": true
  },
  "meta": {
    "recalculatedGroups": 42
  }
}
```

`autoAnalyze` is deprecated and ignored; use the Analysis schedule in Settings > Automation.

## Documents

### GET /api/v1/documents

Lists documents.

Query params:

- `limit`, `offset`
- `correspondent`
- `documentType`
- `tag`
- `processingStatus` (`pending | completed`)
- `search` (title match)
- `noAiResult` (`true` to filter documents without an AI result)

### GET /api/v1/documents/:id

Returns one document, plus content and group memberships.

### GET /api/v1/documents/:id/content

Returns the text content for a single document.

```json
{
  "data": {
    "fullText": "...",
    "wordCount": 450
  }
}
```

Returns `404 NOT_FOUND` if the document content is not available.

### GET /api/v1/documents/stats

Returns aggregate document analytics.

## Duplicates

### GET /api/v1/duplicates

Lists duplicate groups.

Query params:

- `limit`, `offset`
- `minConfidence`, `maxConfidence` (`0..1`)
- `status` (comma-separated: `pending,false_positive,ignored,deleted`)
- `sortBy` (`confidence | created_at | member_count`)
- `sortOrder` (`asc | desc`)

### GET /api/v1/duplicates/:id

Returns group details.

Optional query:

- `light=true` to omit full member text content.

### DELETE /api/v1/duplicates/:id

Deletes group record and memberships (does not delete documents in Paperless).

### GET /api/v1/duplicates/:id/content

Returns text content for two members in a group.

Required query params:

- `docA`
- `docB`

### PUT /api/v1/duplicates/:id/status

Request:

```json
{ "status": "false_positive" }
```

Valid statuses: `pending`, `false_positive`, `ignored`, `deleted`.

### PUT /api/v1/duplicates/:id/primary

Request:

```json
{ "documentId": "..." }
```

### GET /api/v1/duplicates/stats

Returns totals by status, confidence buckets, and top correspondents.

### GET /api/v1/duplicates/graph

Returns graph nodes/edges for visualization.

Query params:

- `minConfidence`, `maxConfidence`
- `status` (comma-separated)
- `maxGroups` (`1..500`, default `100`)

## AI Processing

Starting AI model processing, applying or reverting suggestions, and changing AI configuration
require `AI_ENABLED=true`; these endpoints return `400 BAD_REQUEST` when it is false.
The read-only endpoints `GET /api/v1/ai/stats`, `/api/v1/ai/feedback/summary`, `/api/v1/ai/costs`,
`/api/v1/ai/costs/estimate`, `/api/v1/ai/models`, `/api/v1/ai/results`, `/api/v1/ai/results/:id`,
and `/api/v1/ai/custom-fields/recommendations` answer regardless of that switch. Reading AI config,
result groups, custom-field policy or detailed cost estimates still requires it. Feedback and
single/batch rejection also work without it; reject-all requires it and the bulk switch below.

### Reviewed apply and revert flow

1. Send `POST /api/v1/ai/results/preflight` with `scope`, a non-empty `selection`, and optionally
   `allowClearing` and `createMissingEntities`. It returns `data.token`, `expiresAt`, `resultIds`,
   `selection` and `preflight`. The token expires 15 minutes after preview creation.
2. Review that summary, then send the returned `data.token` as `planToken` to the single apply,
   batch-apply or apply-all endpoint. The response is `202` with `data.jobId`.
3. Read progress and outcome through `GET /api/v1/jobs/:id` or `GET /api/v1/jobs/:id/progress`.
   A queued job is not proof that the mutation succeeded. The worker claims the single-use plan
   and checks the reviewed state before writing.
4. To revert, first send `POST /api/v1/ai/results/:id/revert/preview` with `selection`, review it,
   then send its `data.token` as `planToken` to `POST /api/v1/ai/results/:id/revert`.

Send JSON bodies with `Content-Type: application/json`. The result IDs and selected fields are
frozen in the preview; execution requests carry only `planToken`. Create a fresh preview if a plan
expires or the reviewed state changes.

### GET /api/v1/ai/config

Returns the current AI configuration object.

```json
{
  "data": {
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "maxContentLength": 8000,
    "batchSize": 100,
    "rateDelayMs": 0,
    "includeCorrespondents": false,
    "includeDocumentTypes": false,
    "includeTags": false,
    "reasoningEffort": "low",
    "maxRetries": 10
  }
}
```

### PUT /api/v1/ai/config

Partial update of AI config. Validated against the config schema.

```json
{
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "includeCorrespondents": true
}
```

Returns the full updated config.

### GET /api/v1/ai/models

Returns available models for a provider.

Query params:

- `provider`: `openai` (required)

```json
{
  "data": [
    { "id": "gpt-5.4", "name": "GPT-5.4" },
    { "id": "gpt-5.4-mini", "name": "GPT-5.4 Mini" },
    { "id": "gpt-5.4-nano", "name": "GPT-5.4 Nano" }
  ]
}
```

### POST /api/v1/ai/process

Starts an AI processing batch job.

Optional JSON body:

```json
{
  "reprocess": false,
  "documentIds": ["doc-id-1", "doc-id-2"]
}
```

- `reprocess`: if `true`, re-processes all documents (not just new ones)
- `documentIds`: process only specific documents

Response (202):

```json
{ "data": { "jobId": "..." } }
```

Returns `409 JOB_ALREADY_RUNNING` if a processing job is already active.

### GET /api/v1/ai/results

Lists AI processing results.

Query params:

- `status`: `pending_review`, `applied`, `rejected`, `partial`, `failed`, `skipped`
- `search`: title substring match
- `failed`: `true` to show only failed results
- `minConfidence`, `maxConfidence`: filter by confidence range (`0..1`)
- `provider`: filter by AI provider name
- `model`: filter by AI model name
- `limit`, `offset`

```json
{
  "data": [
    {
      "id": "...",
      "documentTitle": "Invoice 2024-001",
      "suggestedCorrespondent": "Amazon",
      "suggestedDocumentType": "Invoice",
      "suggestedTags": ["shopping", "2024"],
      "confidence": { "correspondent": 0.95, "documentType": 0.90, "tags": 0.80 },
      "currentCorrespondent": null,
      "appliedStatus": "pending_review"
    }
  ],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

### GET /api/v1/ai/results/:id

Returns full details for a single result, including token counts and processing time.

### POST /api/v1/ai/results/:id/apply

Starts a background apply job using a reviewed plan. First preview a
`selected_result_ids` scope containing this result and copy the returned `data.token` to `planToken`.

Required JSON body:

```json
{ "planToken": "opaque-reviewed-plan-token" }
```

Response (202):

```json
{ "data": { "jobId": "job-id" } }
```

A missing token or a token shorter than 16 characters returns `400 BAD_REQUEST`. A conflicting job
returns `409 JOB_ALREADY_RUNNING`; a runtime that is not accepting work returns `503 SERVICE_UNAVAILABLE`.
Poll the job for plan validation and the mutation outcome.

### POST /api/v1/ai/results/:id/reject

Marks a result as rejected.

Optional JSON body:

```json
{ "reason": "Incorrect suggestion" }
```

- `reason`: optional string explaining why the result was rejected.

```json
{ "data": { "rejected": true } }
```

### POST /api/v1/ai/results/batch-apply

Starts a background apply job for the result IDs frozen in a preflight plan. Choose the scope and
fields when requesting the preview, then submit its `data.token` as `planToken` here.

Required JSON body:

```json
{ "planToken": "opaque-reviewed-plan-token" }
```

Response (202):

```json
{ "data": { "jobId": "job-id" } }
```

A missing token or a token shorter than 16 characters returns `400 BAD_REQUEST`. A conflicting job
returns `409 JOB_ALREADY_RUNNING`; a runtime that is not accepting work returns `503 SERVICE_UNAVAILABLE`.
Poll the job for plan validation and the mutation outcome.

### POST /api/v1/ai/results/batch-reject

Rejects multiple results.

```json
{ "resultIds": ["id-1", "id-2"] }
```

Response:

```json
{ "data": { "rejected": 2 } }
```

### POST /api/v1/ai/results/reject-all

Rejects all pending AI results in one call. No request body required.

Requires `AI_BULK_ALL_ENABLED=true` (default `false`); otherwise returns `401 UNAUTHORIZED` when AI is enabled.

```json
{ "data": { "rejected": 15 } }
```

Returns `0` if there are no pending results.

### POST /api/v1/ai/results/apply-all

Starts a background apply job from a reviewed plan. To review all pending results, create the
preview with `scope: { "type": "all_pending" }`, then submit its `data.token` as `planToken`.

Requires `AI_BULK_ALL_ENABLED=true` (default `false`); otherwise returns `401 UNAUTHORIZED` when AI is enabled.

Required JSON body:

```json
{ "planToken": "opaque-reviewed-plan-token" }
```

Response (202):

```json
{ "data": { "jobId": "job-id" } }
```

A missing token or a token shorter than 16 characters returns `400 BAD_REQUEST`. A conflicting job
returns `409 JOB_ALREADY_RUNNING`; a runtime that is not accepting work returns `503 SERVICE_UNAVAILABLE`.
Poll the job for plan validation and the mutation outcome.

### POST /api/v1/ai/results/preflight

Creates a reviewed apply plan without changing Paperless documents. A local plan stores the
selected result versions and live document state for execution-time checks.

Request:

```json
{
  "scope": {
    "type": "selected_result_ids",
    "resultIds": [
      "result-id"
    ]
  },
  "selection": {
    "title": false,
    "correspondent": false,
    "documentType": false,
    "tags": true,
    "processedTag": false,
    "customFieldIds": []
  },
  "allowClearing": false,
  "createMissingEntities": true
}
```

- `scope` is required: `selected_result_ids` with `resultIds`, `all_pending`, or `current_filter` with `filters`.
- `selection` requires all five booleans and `customFieldIds`. At least one boolean must be true or
  the custom-field ID array must be nonempty. IDs must be positive integers; duplicates are removed.
- `allowClearing`: default `false`.
- `createMissingEntities`: default `true`.

Response (200), with an illustrative expiry 15 minutes after creation:

```json
{
  "data": {
    "token": "opaque-reviewed-plan-token",
    "expiresAt": "2030-01-01T12:15:00.000Z",
    "resultIds": [
      "result-id"
    ],
    "selection": {
      "title": false,
      "correspondent": false,
      "documentType": false,
      "tags": true,
      "processedTag": false,
      "customFieldIds": []
    },
    "preflight": {
      "totalDocuments": 1,
      "fieldsChanged": {
        "title": 0,
        "correspondent": 0,
        "documentType": 0,
        "tags": 1,
        "customFields": 0
      },
      "newEntitiesCreated": {
        "correspondents": [],
        "documentTypes": [],
        "tags": []
      },
      "lowConfidenceCount": 0,
      "noOpCount": 0,
      "destructiveClearCount": 0,
      "tagsRemoved": 5,
      "documentsLosingTags": 1,
      "confidenceDistribution": {
        "high": 1,
        "medium": 0,
        "low": 0
      }
    }
  }
}
```

The response field is `token`; copy it to `planToken` in the execution request. Tag-removal counts
use the tags captured when processing completed. Configured protected tags are preserved, and each
document is counted once in `documentsLosingTags`. With `allowClearing: true`, an empty effective
suggestion that removes unprotected tags also increments `destructiveClearCount`.

### GET /api/v1/ai/results/groups

Groups AI results by a specified field.

Required query param:

- `groupBy`: `suggestedCorrespondent`, `suggestedDocumentType`, `failureType`, or `confidenceBand`

Optional filter query params:

- `status`, `search`, `failed` (`true`), `minConfidence`, `maxConfidence`, `provider`, `model`, `changedOnly` (`true`)

Returns grouped result counts and summaries.

### POST /api/v1/ai/results/:id/revert/preview

Creates a reviewed revert plan for an applied or partially applied result with an eligible audit
snapshot. Select only fields that were applied. It does not change Paperless documents.

Request:

```json
{
  "selection": {
    "title": true,
    "correspondent": false,
    "documentType": false,
    "tags": false,
    "processedTag": false,
    "customFieldIds": []
  }
}
```

Response (200):

```json
{
  "data": {
    "token": "opaque-reviewed-revert-token",
    "expiresAt": "2030-01-01T12:15:00.000Z",
    "resultIds": [
      "result-id"
    ],
    "selection": {
      "title": true,
      "correspondent": false,
      "documentType": false,
      "tags": false,
      "processedTag": false,
      "customFieldIds": []
    },
    "preflight": {
      "totalDocuments": 1,
      "fieldsChanged": {
        "title": 1,
        "correspondent": 0,
        "documentType": 0,
        "tags": 0,
        "customFields": 0
      },
      "newEntitiesCreated": {
        "correspondents": [],
        "documentTypes": [],
        "tags": []
      },
      "lowConfidenceCount": 0,
      "noOpCount": 0,
      "destructiveClearCount": 0,
      "tagsRemoved": 0,
      "documentsLosingTags": 0,
      "confidenceDistribution": {
        "high": 0,
        "medium": 0,
        "low": 0
      }
    }
  }
}
```

The token expires after 15 minutes and is submitted as `planToken` to the revert endpoint.
An invalid or empty selection returns `400 BAD_REQUEST`. A result that cannot be previewed for
revert, including a missing result or unavailable snapshot, returns `409 CONFLICT`.

### POST /api/v1/ai/results/:id/revert

Starts a background revert job that restores the selected pre-apply values. First request
`POST /api/v1/ai/results/:id/revert/preview`, then copy its `data.token` into `planToken`.

Required JSON body:

```json
{ "planToken": "opaque-reviewed-plan-token" }
```

Response (202):

```json
{ "data": { "jobId": "job-id" } }
```

A missing token or a token shorter than 16 characters returns `400 BAD_REQUEST`. A conflicting job
returns `409 JOB_ALREADY_RUNNING`; a runtime that is not accepting work returns `503 SERVICE_UNAVAILABLE`.
Poll the job for plan validation and the mutation outcome.

### POST /api/v1/ai/results/:id/feedback

Records user feedback on an AI result.

Request:

```json
{
  "action": "rejected",
  "rejectedFields": ["correspondent"],
  "corrections": { "correspondent": "Acme Corp" },
  "reason": "Wrong company identified"
}
```

- `action` (required): `rejected`, `corrected`, or `partial_applied`
- `rejectedFields`: array of field names that were incorrect
- `corrections`: object mapping field names to corrected values
- `reason`: optional free-text explanation

Response (201):

```json
{ "data": { "recorded": true } }
```

### GET /api/v1/ai/feedback/summary

Returns an aggregate summary of all recorded AI feedback.

### GET /api/v1/ai/costs

Returns AI cost statistics.

Optional query param:

- `days`: integer, limits stats to the last N days

### GET /api/v1/ai/costs/estimate

Estimates the cost of processing a batch of documents.

Required query param:

- `documentCount`: positive integer

Returns `404 NOT_FOUND` if no pricing data is available for the configured model.

### GET /api/v1/ai/stats

Returns aggregate AI processing statistics.

```json
{
  "data": {
    "totalProcessed": 150,
    "pendingReview": 42,
    "applied": 95,
    "rejected": 13,
    "failed": 3,
    "totalPromptTokens": 450000,
    "totalCompletionTokens": 25000
  }
}
```

## Batch Operations

### POST /api/v1/batch/status

Updates status for many groups.

```json
{
  "groupIds": ["...", "..."],
  "status": "ignored"
}
```

`groupIds` must contain `1..1000` ids.

Response:

```json
{ "data": { "updated": 2 } }
```

### POST /api/v1/batch/delete-non-primary

Starts destructive batch delete in Paperless (background job).

```json
{
  "groupIds": ["...", "..."],
  "confirm": true
}
```

Rules:

- `confirm` must be `true`
- all groups must currently be `pending`

Response (202):

```json
{ "data": { "jobId": "..." } }
```

### POST /api/v1/batch/purge-deleted

Purges all duplicate groups with `deleted` status from the database. No request body required.

Returns the count of purged groups.

## Export / Import

### GET /api/v1/export/duplicates.csv

Downloads CSV. Supports same filter params as `GET /api/v1/duplicates`.

### GET /api/v1/export/config.json

Downloads config backup JSON.

### POST /api/v1/import/config

Imports config backup JSON.

Response:

```json
{
  "data": {
    "appConfigKeys": 5,
    "dedupConfigUpdated": true
  }
}
```

## Paperless Proxy Endpoints

### GET /api/v1/paperless/documents/:paperlessId/preview

Proxies Paperless preview stream.

### GET /api/v1/paperless/documents/:paperlessId/thumb

Proxies Paperless thumbnail stream.

### GET /api/v1/paperless/trash

Returns recycle bin count.

```json
{ "data": { "count": 12 } }
```

### POST /api/v1/paperless/trash

Request:

```json
{ "action": "empty" }
```

Response:

```json
{ "data": { "emptied": true } }
```
