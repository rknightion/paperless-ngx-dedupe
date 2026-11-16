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
- `GET /api/v1/export/documents.csv` (raw CSV download)
- `GET /api/v1/maintenance/backup` (raw SQLite download)
- `GET /api/v1/diagnostics` (raw JSON download)
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
{ "force": true, "purge": false }
```

Response (202):

```json
{ "data": { "jobId": "..." } }
```

`force` and `purge` act only when literally `true`; both default to false. `purge: true`
clears local synced data before a full sync. It does not delete documents in Paperless-NGX.
Returns `409 JOB_ALREADY_RUNNING` for a conflicting job or `503 SERVICE_UNAVAILABLE`
when the runtime is not accepting work.

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

- `type`: `sync | analysis | batch_operation | ai_processing | ai_apply | ai_revert | custom_field_discovery`
- `status`: `pending | running | paused | completed | failed | cancelled`
- `limit`: `1..200` in the legacy list mode, which returns a job array in `data`.
- `active`: `true` returns only pending, running and paused jobs in the legacy list mode.
  Any other present value returns `400 VALIDATION_FAILED`. It combines with `type` and
  `status` by AND; a terminal status with `active=true` returns an empty array.
  Cursor history mode is unchanged.

Supplying `pageSize` or `cursor` selects cursor history mode. `pageSize` is an integer
from 1 to 100, default 25; `cursor` is the opaque `meta.nextCursor` from the previous
response. This mode validates `type` and `status` against the values above. Its `data`
is an array of history items; `meta` contains `nextCursor` (null at the end), `pageSize`,
`filters: { type, status }` (null for absent filters), and job-history `counts: { clearable: number }`.
Invalid pagination, cursor or cursor-mode filters return `400 VALIDATION_FAILED`.

### DELETE /api/v1/jobs

Clears local completed, failed and cancelled job history, retaining failed jobs with a
terminal reason or dead-letter dispatch intent. Pending, running and paused jobs remain.
Associated dispatch intents for cleared jobs are deleted. Paperless-NGX is not mutated.
No body or query parameters are required. Returns `data: { deleted: number }`.

### GET /api/v1/jobs/:jobId

Get one job.

Job object fields:

```json
{
  "id": "...",
  "type": "sync",
  "status": "running",
  "progress": 0.42,
  "phaseProgress": 0.7,
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
  "phaseProgress": 0.7,
  "message": "...",
  "status": "running"
}
```

The `complete` event also contains `errorMessage` and the fields spread from the parsed
job `resultJson`. A job already in a terminal state emits `complete` immediately.
Missing jobs return `404 NOT_FOUND`; stream events do not use the JSON envelope.

### POST /api/v1/jobs/:jobId/cancel

Cancels a pending/running job.

```json
{ "data": { "jobId": "...", "status": "cancelled" } }
```

### POST /api/v1/jobs/:jobId/pause

Pauses a running job at its next cooperative checkpoint. No body or query parameters
are required. Returns `data: { jobId: string, status: "paused" }`.
Returns `404 NOT_FOUND` for a missing job or `409 CONFLICT` when it cannot be paused.

### POST /api/v1/jobs/:jobId/resume

Resumes a paused job. No body or query parameters are required.
Returns `data: { jobId: string, status: "running" }`.
Returns `404 NOT_FOUND` for a missing job or `409 CONFLICT` when it cannot be resumed.

## Configuration

### GET /api/v1/config

Returns mutable app config key/value map from DB. Environment-owned Paperless connection settings
and credential keys are omitted. `meta.registry` describes the configuration keys, types and ownership.

### PUT /api/v1/config

Accepts either:

```json
{ "key": "dedup.similarityThreshold", "value": 0.8 }
```

or:

```json
{ "settings": { "dedup.similarityThreshold": 0.8 } }
```

Returns the safe mutable config map with `meta.registry`. Read-only keys, including credentials
and environment-owned connection settings, and unknown keys are rejected with
`400 VALIDATION_FAILED`. Bodies are strict single-key or batch objects; duplicate JSON keys
and invalid values are also rejected.

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

#### Library cursor mode

Add `library=true` to use the library query instead of the legacy list. Other values of
`library`, repeated query parameters, unknown parameters and invalid filters return
`400 VALIDATION_FAILED`. The library accepts:

| Parameter | Type and limits |
| --- | --- |
| `text`, `correspondent`, `documentType`, `tag` | Optional trimmed strings, 1 to 200 characters |
| `missingOcr`, `missingCorrespondent`, `missingDocumentType`, `missingTags` | Optional `true`, `false`, `1` or `0` |
| `correspondentSet`, `documentTypeSet`, `tagSet` | Optional canonical JSON array string, 1 to 2100 characters, with 1 to 10 sorted unique strings of 1 to 200 characters; no surrounding whitespace or control characters |
| `customFieldId` | Optional positive integer |
| `customFieldValue` | Optional canonical JSON string, 1 to 2000 characters, encoding a string, finite number, boolean, number array or null; requires `customFieldId` |
| `duplicate` | `any` (default), `involved` or `not-involved` |
| `aiStatus` | `unprocessed`, `pending_review`, `applied`, `partial`, `reverted`, `rejected`, `failed` or `skipped` |
| `freshness` | Optional `fresh` or `stale` |
| `cursor` | Optional opaque cursor from the previous response, 1 to 1000 characters |
| `limit` | `25`, `50` (default) or `100` |

For each correspondent, document type or tag family, the single-value, set and missing
filters are mutually exclusive. `data` is an array of document summaries (`id`, `paperlessId`,
`title`, `correspondent`, `documentType`, `tags`, `createdDate`, `addedDate`, `processingStatus`)
plus `hasOcr`, `duplicateGroupCount`, `duplicateGroupId`, `duplicateGroupStatus`, `aiStatus`,
`aiFailureType` and `aiFreshness`. `meta` contains `nextCursor`, normalized `query`, and
`counts: { total, missingOcr, duplicateInvolved, aiUnprocessed, aiStale }`.

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

Returns group details. Each member includes the nullable file facts `originalFileName`,
`archiveSerialNumber`, `pageCount`, and `mimeType`, including in light responses. These are
stored list metadata, not file contents or checksums. Sync fills missing facts on documents it
fetches without counting unchanged documents as updated or re-queuing them for analysis.
A full sync can backfill older documents outside the incremental fetch window.

Paperless-NGX v2.13.5 exposes `page_count` but not the list `mime_type`; v2.20.6 exposes both.
Missing fields remain `null` and the comparison displays a dash. These two versions were checked
against their tagged upstream serializers; this is not a claim about the first supporting release.

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

### DELETE /api/v1/duplicates/:id/members/:memberId

Removes a non-primary member from a local duplicate group; it does not delete the document
or mutate Paperless-NGX. No body or query parameters are required.
Returns `data: { removed: true }`. Returns `404 NOT_FOUND` for a missing member,
`409 CONFLICT` for a primary member or a conflicting operation lease.

### POST /api/v1/duplicates/cleanup-document

Removes a document's memberships from all local duplicate groups, updates affected groups
and promotes a remaining primary where needed. Paperless-NGX is not mutated.
Requires JSON `{ "documentId": "local-document-id" }`, with a nonempty string ID.
Returns `data: { groupsAffected: number, groupsAutoResolved: number }`.
Invalid input returns `400 BAD_REQUEST`; a conflicting operation lease returns `409 CONFLICT`.

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

Returns the available OpenAI models. No query parameters are required or consumed.

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

The optional `scope` object takes precedence over legacy `reprocess` and `documentIds`:

| `scope.type` | Additional fields |
| --- | --- |
| `new_only` | None; default without a scope or legacy selection |
| `failed_only` | None |
| `full_reprocess` | None |
| `selected_document_ids` | `documentIds`: 1 to 50000 nonempty strings |
| `current_filter` | `filters`: object passed to document selection |

An empty resolved selection returns `200` with `data: { jobId: null, nothingToDo: true }`.
Invalid scope/body input returns `400 VALIDATION_FAILED`; disabled AI returns
`400 BAD_REQUEST`; a runtime not accepting work returns `503 SERVICE_UNAVAILABLE`.

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

### POST /api/v1/ai/results/:id/reprocess

Reprocesses one result synchronously on the standard tier and replaces the local suggestion;
it does not apply metadata to Paperless-NGX. No body is required. Optional `mode=inbox`
selects the inbox error context. Returns `data: { reprocessed: true, resultId: string }`.
Disabled AI or a missing provider key returns `400 BAD_REQUEST`; a missing result returns
`404 NOT_FOUND`. An applied or partially applied result, or invalid custom-field policy,
returns `409 CONFLICT`. Revert protected results before reprocessing.

### POST /api/v1/ai/results/clear

Deletes all local AI result rows, including their dependent records, without changing
Paperless-NGX metadata. No body or query parameters are required.
Returns `data: { deleted: number }`; disabled AI returns `400 BAD_REQUEST`.

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

### GET /api/v1/ai/costs/estimate-detailed

Estimates processing costs across supported models for the current unprocessed documents.
No query parameters are required. `data` contains `documentCount`, `currentModel`, `allModels`
and `tokenBreakdown: { systemPromptTokens, totalUserPromptTokens, avgCompletionTokens }`.
Each model estimate has `modelId`, `modelName`, `provider`, `hasCachePricing`, and `bestCase`
and `worstCase`, each with `totalCostUsd` and `perDocumentCostUsd`.
Disabled AI returns `400 BAD_REQUEST`; unavailable pricing returns `404 NOT_FOUND`.

### GET /api/v1/ai/custom-fields/policy

Reads the local extraction policy and available Paperless custom fields. No query parameters
are required. Returns `data: { policy: PolicyEntry[], availableFields: CustomField[] }`.
A policy entry has `fieldId`, `fieldName`, `dataType` and nullable `guidance`; available fields
have `id`, `name`, `dataType`, `documentCount` and
`extraData: { selectOptions: [{ id, label }], defaultCurrency? }`. They are sorted by ID,
excluding `documentlink`.
Disabled AI returns `400 BAD_REQUEST`; upstream connection/API errors return `502 BAD_GATEWAY`.

### PUT /api/v1/ai/custom-fields/policy

Replaces the local extraction policy without creating or changing Paperless custom fields.
Requires strict JSON `{ "fields": [{ "fieldId": 1, "guidance": "Extract the reference" }] }`.
`fields` has at most 50 entries; `fieldId` is a positive integer and optional `guidance` is
null or a string of at most 500 characters. Each entry is strict; an empty array clears the policy.
Returns `data: { policy: PolicyEntry[] }` with the shape above. Invalid JSON, duplicate keys,
unknown properties or policy validation failures return `400 VALIDATION_FAILED`.
Disabled AI returns `400 BAD_REQUEST`; upstream errors return `502 BAD_GATEWAY`.

### GET /api/v1/ai/custom-fields/recommendations

Reads the latest local custom-field discovery run. No query parameters are required.
Returns `data: { run: null }` before any run, otherwise `run` contains `key`, `status`
(`running`, `completed` or `failed`), `createdAt`, nullable `completedAt`, nullable `result`
and nullable `error: { code, retryable: true }`. The aggregate result contains `runKey`,
`algorithmVersion`, `status`, `phase`, `documentsScanned`, `documentsWithOcr`,
`sourceFingerprint`, `stale`, `truncatedLabelSpace`, `candidates` and `diagnostics`.
Candidate entries describe names, recommended types/guidance, counts, coverage, confidence,
value profiles and risks; the complete nested shape is `CustomFieldDiscoveryRunV2` in
`packages/core/src/ai/custom-field-discovery-v2.ts`. No special validation errors are returned.

### POST /api/v1/ai/custom-fields/recommendations

Queues local custom-field discovery without creating fields in Paperless-NGX.
No body or query parameters are required. Returns `202` with
`data: { jobId: string, existingFieldsUnavailable: boolean }`; the boolean is true if fetching
existing Paperless field names failed. Returns `409 JOB_ALREADY_RUNNING` for a conflicting job
or `503 SERVICE_UNAVAILABLE` when the runtime is not accepting work.

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

`groupIds` must contain `1..20000` nonempty string ids. `status` is `pending`, `ignored` or `false_positive`.

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

Alternatively, submit a reviewed preview token:

```json
{ "planToken": "opaque-reviewed-deletion-plan-token", "confirm": true }
```

Rules:

- `confirm` must be `true`.
- Legacy `groupIds` contains 1 to 20000 nonempty strings; all groups must currently be `pending`.
- `planToken` is a string of 32 to 256 characters from the preview endpoint below.
- The worker deletes non-primary documents in Paperless-NGX and cleans up local records.

Invalid input or preview validation returns `400 VALIDATION_FAILED`. Conflicting work returns
`409 JOB_ALREADY_RUNNING`; an invalid or unavailable plan returns `409 CONFLICT`.
A runtime not accepting work returns `503 SERVICE_UNAVAILABLE`.

Response (202):

```json
{ "data": { "jobId": "..." } }
```

### POST /api/v1/batch/delete-non-primary/preview

Creates a local reviewed deletion plan; no Paperless-NGX documents are deleted at this stage.
Requires JSON `{ "groupIds": ["group-id"] }`, with 1 to 50000 nonempty strings.
Returns `data: { planToken, expiresAt, groupCount, documentCount, groups }`.
`planToken` is the opaque token for execution, `expiresAt` is an ISO timestamp, and counts
are numbers. Each group contains `groupId`, `updatedAt`, `primaryDocumentId`,
`primaryPaperlessId` and `nonPrimaryDocuments: [{ documentId, paperlessId }]`.
The plan expires after 15 minutes. Invalid JSON, IDs or group state return
`400 VALIDATION_FAILED`; a runtime not accepting work returns `503 SERVICE_UNAVAILABLE`.

Optional `mergeMetadata: true` previews missing metadata to copy to the keeper. Each group then
also contains `merge: { addTags, setCorrespondent, setDocumentType, addCustomFieldNames }`.
The scalar additions are null when no assignment is needed; custom-field values are not returned.
Tags exclude inbox tags and existing keeper tags. Nonempty keeper values always win conflicts.
Local document metadata supplies the preview, while read-only Paperless tag and custom-field
lookups identify inbox tags and field names. An upstream lookup failure returns `502 BAD_GATEWAY`
without storing a plan. The enabled option and additions are frozen with the reviewed plan.

Merge-enabled execution reads the keeper, remaining members and inbox-tag definitions from
Paperless before deleting a group. It fills missing tags, correspondent and document type on the
keeper first. A metadata read or update failure marks that group failed and skips all its deletes;
other groups can still finish. A resumed job preserves completed deletion checkpoints and does not
repeat an already satisfied metadata update.

Custom-field additions are previewed but are not yet copied. If the live merge needs any, execution
fails that group before updating or deleting documents. The UI remains preview-only until
custom-field execution is available. Omit the option or set it to false to retain the existing
deletion behavior, response shape and absence of metadata lookups. Copying metadata is not an undo:
restoring a deleted document does not revert additions to the keeper.

### POST /api/v1/batch/purge-deleted

Purges all duplicate groups with `deleted` status from the database. No request body required.

Returns the count of purged groups.

## Export / Import

### GET /api/v1/export/duplicates.csv

Downloads CSV. Supports same filter params as `GET /api/v1/duplicates`.

### GET /api/v1/export/documents.csv

Downloads matching library documents as raw CSV without OCR text. Accepts the library-mode
filters, cursor and limit described under `GET /api/v1/documents`, but not the `library`
selector. The stream follows every page from the cursor; `limit` does not cap the total export.
Columns are `paperless_id`, `title`, `correspondent`, `document_type`, `tags`, `created_date`,
`added_date`, `processing_status`, `has_ocr`, `duplicate_group_count`, `ai_status` and
`ai_freshness`. Repeated, unknown or invalid query parameters return `400 VALIDATION_FAILED`.
Successful downloads have private, non-storing cache headers and no `data` envelope.

### GET /api/v1/export/config.json

Downloads config backup JSON.

### POST /api/v1/import/config

Previews or applies a configuration backup from the config export endpoint.
Use a strict JSON wrapper:

```json
{
  "mode": "preview",
  "backup": {
    "version": "1.0",
    "exportedAt": "2030-01-01T00:00:00.000Z",
    "appConfig": {},
    "dedupConfig": {}
  }
}
```

Use an exported backup for real restores. Backup `version` must be a string beginning `1.`;
`exportedAt` is a string, `appConfig` is a key/value object and `dedupConfig` follows the
deduplication configuration schema. Preview returns `data`
with normalized `appConfig`, `deprecatedKeys`, `droppedKeys`, and
`scheduledAiOptIn: { requested, requiresConfirmation }` without applying it.
For application, use `mode: "apply"` and optional boolean `confirmScheduledAiOptIn`
(default false). Apply returns `data` with `appConfigKeys`, `dedupConfigUpdated`,
`deprecatedKeys`, `droppedKeys`, and `scheduledAiOptIn: { requested, applied, reason }`.
The reason is `not_requested`, `confirmation_required`, `schedule_not_configured` or `confirmed`.
Deprecated entries identify `ai.autoProcess`, action `scheduled_ai_opt_in` and
`requiresConfirmation: true`.

Raw backup bodies remain supported and apply with scheduled-AI confirmation false.
Malformed or duplicate-key JSON, invalid wrappers, backup shapes or configuration values
return `400 VALIDATION_FAILED`. Paperless-NGX is not mutated.

## Paperless Proxy Endpoints

### DELETE /api/v1/paperless/documents/:paperlessId

Deletes the document in Paperless-NGX, then removes its local document data and duplicate
memberships. The numeric path ID must be positive and the document must belong to a local
duplicate group. No body or query parameters are required.
Returns `data: { deleted: true, alreadyMissing: boolean }`; upstream 404 is accepted and sets
`alreadyMissing` true. Invalid IDs return `400 BAD_REQUEST`; a document not found in a local
group returns `404 NOT_FOUND`; a conflicting operation lease returns `409 CONFLICT`.
Other upstream failures return `502 BAD_GATEWAY`.

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

## Automation

### GET /api/v1/automation

Reads local automation settings. No query parameters are required.
`data` contains `schedules`, keyed by `sync`, `analysis` and `ai_processing`, and
`ai: { monthlyBudgetUsd, maxDocumentsPerRun, reviewOnly: true }`. Each schedule has
`task`, `enabled`, `cadence`, `timezone` and nullable ISO `nextRunAt`.
No special validation errors are returned.

### PUT /api/v1/automation

Updates one local schedule and optionally its AI budget settings. The strict JSON body requires:

| Field | Type and limits |
| --- | --- |
| `task` | `sync`, `analysis` or `ai_processing` |
| `enabled` | Boolean; cannot be true with manual cadence |
| `timezone` | Nonempty valid IANA timezone string |
| `cadence` | Strict object with `kind`: `manual`, `interval`, `daily` or `weekly` |
| `ai` | Optional strict object, allowed only for `ai_processing` |

Interval cadence also requires `hours`: 2, 4, 6 or 12. Daily and weekly cadence require
integer `hour` (0 to 23) and `minute` (0 to 59); weekly also requires integer `weekday`
(0 to 6). `ai` requires finite `monthlyBudgetUsd` (0 to 1000000) and integer
`maxDocumentsPerRun` (1 to 10000). Enabling scheduled AI requires a positive budget.
Returns the same settings shape as GET. Invalid JSON or settings return `400 VALIDATION_FAILED`.

### POST /api/v1/automation/run

Queues one manual automation task using the durable dispatcher. Requires strict JSON
`{ "task": "sync" }`, where task is `sync`, `analysis` or `ai_processing`.
Returns `202` with `data: { jobId: string }`. Invalid input returns `400 VALIDATION_FAILED`;
disabled AI for an AI task returns `400 BAD_REQUEST`. Conflicting work returns
`409 JOB_ALREADY_RUNNING`; a runtime not accepting work returns `503 SERVICE_UNAVAILABLE`.

## Data Quality

### GET /api/v1/data-quality

Returns local library quality counts and links, with no query parameters.
`data` is `{ totalDocuments: number, insights: [{ kind, count, label, url }] }`.
Insight kinds are `missing-correspondent`, `missing-document-type`, `missing-tags`, `ocr-gap`,
`overused-tag`, `near-duplicate-correspondent`, `near-duplicate-document-type` and
`custom-field-opportunity`. Responses are private and not cached; there are no special
validation errors.

## Maintenance and Diagnostics

### GET /api/v1/maintenance/backup

Downloads a consistent local SQLite backup without mutating Paperless-NGX.
No body or query parameters are required. The response is raw `application/vnd.sqlite3`,
with `Content-Length` and an attachment filename beginning `paperless-ngx-dedupe-backup-`.
It uses private, non-storing cache headers and has no `data` envelope.
Conflicting operations or another backup return `409 CONFLICT`; a runtime not accepting
work returns `503 SERVICE_UNAVAILABLE`.

### GET /api/v1/diagnostics

Downloads redacted aggregate diagnostics as raw JSON with no query parameters or `data` envelope.
The attachment is `paperless-ngx-dedupe-diagnostics.json` with private, non-storing cache headers.
The object contains `formatVersion: 1`, `versions: { application, build?, node }`, aggregate
`counts`, `featureFlags`, categorical `readiness: { database, paperless, ai }`,
`database: { sqliteUserVersion, sizeBytes }`, and `recentOutcomes: [{ category, outcome, count }]`.
The exact count and feature-flag keys are defined by `DiagnosticsBundle` in
`packages/core/src/diagnostics/collect.ts`. No special validation errors are returned.

## Notifications

### GET /api/v1/notifications

Returns notification availability and stored event preferences:

```json
{
  "data": {
    "configured": true,
    "format": "json",
    "events": {
      "onNewDuplicates": true,
      "minNewGroups": 1,
      "onJobFailure": true,
      "scheduledRunsOnly": true
    }
  }
}
```

`configured` indicates whether `NOTIFY_URL` is set. The destination URL and authorization
header are never returned. Event preferences use the corresponding `notifications.*` keys
through the configuration API; `minNewGroups` accepts integers from 1 through 10000.

After successful analysis, `onNewDuplicates` allows a count-only event when the number of newly
created groups reaches `minNewGroups`. By default only scheduled jobs and their dependent analysis
jobs notify. Set `scheduledRunsOnly` to false to include manual runs. Delivery starts after the
job is completed and its operation lease is released; delivery failure cannot change that outcome.

### POST /api/v1/notifications/test

Sends a synthetic, zero-count `duplicates.new` event to the environment-owned notification destination.
No body is required. Request bodies cannot override the destination or authorization header.
The JSON format uses `test` for both `jobId` and `jobType`; no job is created.

Returns HTTP 200 with `{ "data": { "delivered": true, "status": 204 } }` when delivery succeeds.
`status` is the destination's HTTP response code, or `null` when no response was received.
With `NOTIFY_URL` unset, the result is `{ "data": { "delivered": false, "status": null } }`
and no outbound request is made. Delivery failures also return `delivered: false`.
Neither the destination URL nor the authorization value is returned.

Delivery uses at most three attempts with a ten-second timeout each. Retry delays start at
one and four seconds, include bounded jitter, and honor `Retry-After` up to ten seconds.
The total retry and timeout budget is at most fifty seconds.
