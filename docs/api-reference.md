---
title: API Reference
description: REST API reference for Paperless NGX Dedupe
---

# API Reference

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
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

`details` is optional (usually validation details).

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

See [Configuration > Prometheus Scrape Endpoint](configuration.md#prometheus-scrape-endpoint-optional) for setup details.

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

Returns app config key/value map from DB.

### PUT /api/v1/config

Accepts either:

```json
{ "key": "some.key", "value": "some-value" }
```

or:

```json
{ "settings": { "some.key": "value", "another.key": "value" } }
```

Returns full config map.

### POST /api/v1/config/test-connection

Tests Paperless connectivity.

- If body includes `url`, validates explicit body config.
- Otherwise uses current runtime env config.

Body shape when explicit:

```json
{
  "url": "http://paperless:8000",
  "token": "..."
}
```

or

```json
{
  "url": "http://paperless:8000",
  "username": "admin",
  "password": "..."
}
```

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

All AI endpoints return `400 BAD_REQUEST` when `AI_ENABLED` is `false`.

### GET /api/v1/ai/config

Returns the current AI configuration object.

```json
{
  "data": {
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "maxContentLength": 8000,
    "batchSize": 10,
    "rateDelayMs": 500,
    "autoProcess": false,
    "includeCorrespondents": false,
    "includeDocumentTypes": false,
    "includeTags": false,
    "reasoningEffort": "low",
    "maxRetries": 3
  }
}
```

### PUT /api/v1/ai/config

Partial update of AI config. Validated against the config schema.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "includeCorrespondents": true
}
```

Returns the full updated config.

### GET /api/v1/ai/models

Returns available models for a provider.

Query params:

- `provider`: `openai` or `anthropic` (required)

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

- `status`: `pending`, `applied`, `rejected`, `partial`
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
      "appliedStatus": "pending"
    }
  ],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

### GET /api/v1/ai/results/:id

Returns full details for a single result, including token counts and processing time.

### POST /api/v1/ai/results/:id/apply

Applies AI suggestions to the document in Paperless-NGX.

Optional JSON body:

```json
{
  "fields": ["correspondent", "tags"],
  "allowClearing": false,
  "createMissingEntities": true
}
```

- `fields`: if omitted, all three fields (`correspondent`, `documentType`, `tags`) are applied. Partial field lists result in `partial` status.
- `allowClearing`: when `true`, allows setting fields to `null`. Default `false`.
- `createMissingEntities`: when `true`, missing correspondents, document types, and tags are created automatically in Paperless-NGX. Default `true`.

```json
{ "data": { "applied": true } }
```

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

Applies multiple results as a background job.

```json
{
  "resultIds": ["id-1", "id-2"],
  "fields": ["correspondent", "documentType", "tags"],
  "allowClearing": false,
  "createMissingEntities": true
}
```

Alternatively, use a `scope` object instead of `resultIds`:

```json
{
  "scope": { "type": "current_filter", "filters": { "status": "pending" } },
  "fields": ["correspondent", "documentType", "tags"]
}
```

Response (202):

```json
{ "data": { "jobId": "..." } }
```

Returns `409 JOB_ALREADY_RUNNING` if an apply job is already active.

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

```json
{ "data": { "rejected": 15 } }
```

Returns `0` if there are no pending results.

### POST /api/v1/ai/results/apply-all

Applies all pending AI results as a background job.

Optional JSON body:

```json
{
  "scope": { "type": "all_pending" },
  "fields": ["correspondent", "documentType", "tags"],
  "allowClearing": false,
  "createMissingEntities": true
}
```

- `scope`: defaults to `{ "type": "all_pending" }`. Can also use `{ "type": "current_filter", "filters": {...} }`.
- `fields`: defaults to all three fields if omitted.

Response (202):

```json
{ "data": { "jobId": "..." } }
```

Returns `409 JOB_ALREADY_RUNNING` if an apply job is already active.

### POST /api/v1/ai/results/preflight

Pre-validates what would happen if results were applied, without making changes.

Request:

```json
{
  "scope": { "type": "all_pending" },
  "fields": ["correspondent", "documentType", "tags"],
  "allowClearing": false,
  "createMissingEntities": true
}
```

- `scope` is required.
- `fields`: defaults to all three.
- `createMissingEntities`: default `true`.

Returns a summary of entities that would be created, documents that would be modified, and any conflicts.

### GET /api/v1/ai/results/groups

Groups AI results by a specified field.

Required query param:

- `groupBy`: `suggestedCorrespondent`, `suggestedDocumentType`, `failureType`, or `confidenceBand`

Optional filter query params:

- `status`, `search`, `failed` (`true`), `minConfidence`, `maxConfidence`, `provider`, `model`, `changedOnly` (`true`)

Returns grouped result counts and summaries.

### POST /api/v1/ai/results/:id/revert

Reverts a previously applied AI result, restoring the original field values in Paperless-NGX using the pre-apply snapshot.

No request body required.

```json
{ "data": { "reverted": true } }
```

Error conditions:

- `404 NOT_FOUND` if the result does not exist
- `400 BAD_REQUEST` if the result was not applied or has no pre-apply snapshot

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

## Document Q&A

All endpoints return `404` when `RAG_ENABLED=false`.

### GET /api/v1/rag/config

Returns current RAG configuration.

```json
{
  "data": {
    "embeddingModel": "text-embedding-3-small",
    "embeddingDimensions": 1536,
    "chunkSize": 400,
    "chunkOverlap": 40,
    "topK": 10,
    "answerProvider": "openai",
    "answerModel": "gpt-5.4-mini",
    "systemPrompt": "You are a helpful document assistant...",
    "maxContextTokens": 4000,
    "autoIndex": false
  }
}
```

### PUT /api/v1/rag/config

Updates RAG configuration. Accepts a partial object — only included fields are updated.

```json
{
  "embeddingModel": "text-embedding-3-large",
  "topK": 15,
  "autoIndex": true
}
```

### POST /api/v1/rag/ask

Streams a Q&A response. Send a question and optionally a conversation ID for multi-turn.

**Request:**

```json
{
  "question": "What was my electricity bill last quarter?",
  "conversationId": "abc123"
}
```

**Response:** Server-Sent Events stream (Vercel AI SDK data stream format). Custom headers:

| Header | Description |
| --- | --- |
| `X-Conversation-Id` | ID of the conversation (created if not provided) |
| `X-Sources` | JSON array of source citations |

Each source citation:

```json
{
  "documentId": "doc_abc",
  "title": "British Gas Energy Bill Q1 2024",
  "chunkContent": "Period: 1 Jan - 31 Mar 2024. Total: £142.50...",
  "score": 0.034
}
```

### POST /api/v1/rag/index

Starts a background indexing job. Returns `202` with a job ID.

**Request (optional):**

```json
{
  "rebuild": true
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `rebuild` | boolean | `false` | When `true`, deletes all existing chunks and re-indexes everything. Required after changing embedding model or dimensions. |

**Response:**

```json
{
  "data": { "jobId": "job_xyz" }
}
```

Track progress via `GET /api/v1/jobs/:jobId/progress` (SSE).

### GET /api/v1/rag/stats

Returns index and conversation statistics.

```json
{
  "data": {
    "totalChunks": 12500,
    "indexedDocuments": 2400,
    "unindexedDocuments": 100,
    "embeddingModel": "text-embedding-3-small",
    "lastIndexedAt": "2026-03-23T10:30:00.000Z",
    "totalConversations": 15,
    "totalMessages": 87
  }
}
```

### GET /api/v1/rag/conversations

Lists conversations, ordered by most recent first.

**Query parameters:** `limit` (default 20), `offset` (default 0).

```json
{
  "data": [
    {
      "id": "conv_abc",
      "title": "What was my electricity bill last quarter?",
      "createdAt": "2026-03-23T10:30:00.000Z",
      "updatedAt": "2026-03-23T10:32:00.000Z",
      "messageCount": 4
    }
  ],
  "meta": { "total": 15 }
}
```

### GET /api/v1/rag/conversations/:id

Returns a single conversation with all messages.

```json
{
  "data": {
    "id": "conv_abc",
    "title": "What was my electricity bill last quarter?",
    "createdAt": "2026-03-23T10:30:00.000Z",
    "updatedAt": "2026-03-23T10:32:00.000Z",
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": "What was my electricity bill last quarter?",
        "sourcesJson": "[{\"documentId\":\"doc_abc\",\"title\":\"...\"}]",
        "tokenUsage": null,
        "createdAt": "2026-03-23T10:30:00.000Z"
      },
      {
        "id": "msg_2",
        "role": "assistant",
        "content": "Based on your British Gas energy bill...",
        "sourcesJson": null,
        "tokenUsage": 450,
        "createdAt": "2026-03-23T10:30:05.000Z"
      }
    ]
  }
}
```

### DELETE /api/v1/rag/conversations/:id

Deletes a conversation and all its messages. Returns `404` if not found.

```json
{
  "data": { "deleted": true }
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
