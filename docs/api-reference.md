---
title: API Reference
description: Complete REST API documentation for Paperless-Dedupe with curl examples
---

# API Reference

All endpoints are served under the base path `/api/v1/`.

## Conventions

### Response Envelope

**Success responses** follow this shape:

```json
{
  "data": { ... },
  "meta": { ... }
}
```

The `meta` field is optional and only included when the endpoint provides pagination or additional context (e.g., `total`, `limit`, `offset`, `recalculatedGroups`).

**Error responses** follow this shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": [...]
  }
}
```

The `details` array is optional and typically contains Zod validation issues.

### Error Codes

| Code                  | HTTP Status | Description                                                  |
| --------------------- | ----------- | ------------------------------------------------------------ |
| `VALIDATION_FAILED`   | 400         | Invalid request parameters or body                           |
| `UNAUTHORIZED`        | 401         | Missing or invalid authentication                            |
| `NOT_FOUND`           | 404         | Resource does not exist                                      |
| `CONFLICT`            | 409         | Resource state conflict (e.g., already resolved)             |
| `JOB_ALREADY_RUNNING` | 409         | A job of the same type is already in progress                |
| `INTERNAL_ERROR`      | 500         | Unexpected server error                                      |
| `NOT_READY`           | 503         | Application is not ready (database or Paperless unreachable) |

### Pagination

Paginated endpoints accept these query parameters:

| Parameter | Default | Range    | Description              |
| --------- | ------- | -------- | ------------------------ |
| `limit`   | 50      | 1 -- 100 | Number of items per page |
| `offset`  | 0       | 0+       | Number of items to skip  |

Paginated responses include pagination metadata:

```json
{
  "data": [...],
  "meta": { "total": 142, "limit": 50, "offset": 0 }
}
```

---

## Health & Readiness

### GET /api/v1/health

Basic health check. Returns 200 if the server is running.

**Response:**

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/health
```

---

### GET /api/v1/ready

Deep readiness check. Verifies database connectivity and Paperless-NGX reachability.

**Response (all checks pass):**

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

**Response (check failed, HTTP 503):**

```json
{
  "error": {
    "code": "NOT_READY",
    "message": "One or more checks failed",
    "details": [
      {
        "database": { "status": "ok" },
        "paperless": { "status": "error", "error": "fetch failed" }
      }
    ]
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/ready
```

---

## Dashboard

### GET /api/v1/dashboard

Returns summary statistics for the dashboard.

**Response:**

```json
{
  "data": {
    "totalDocuments": 1250,
    "unresolvedGroups": 42,
    "storageSavingsBytes": 52428800,
    "pendingAnalysis": 15,
    "lastSyncAt": "2025-01-15T08:00:00.000Z",
    "lastSyncDocumentCount": 50,
    "lastAnalysisAt": "2025-01-15T08:05:00.000Z",
    "totalDuplicateGroups": 67,
    "topCorrespondents": [
      { "correspondent": "Insurance Co", "groupCount": 12 },
      { "correspondent": "Bank", "groupCount": 8 }
    ]
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/dashboard
```

---

## Sync

### POST /api/v1/sync

Trigger a document sync from Paperless-NGX. Returns 202 with the job ID. Only one sync job can run at a time.

**Request body (optional):**

```json
{ "force": true }
```

Setting `force` to `true` performs a full sync, re-fetching all documents even if they have not changed.

**Response (202):**

```json
{
  "data": { "jobId": "01HQ3X..." }
}
```

**Error (409 -- sync already running):**

```json
{
  "error": {
    "code": "JOB_ALREADY_RUNNING",
    "message": "A job of type sync is already running"
  }
}
```

**curl:**

```bash
# Normal sync
curl -X POST http://localhost:3000/api/v1/sync

# Force full sync
curl -X POST http://localhost:3000/api/v1/sync \
  -H 'Content-Type: application/json' \
  -d '{ "force": true }'
```

---

### GET /api/v1/sync/status

Returns the current sync state and whether a sync is in progress.

**Response:**

```json
{
  "data": {
    "lastSyncAt": "2025-01-15T08:00:00.000Z",
    "lastSyncDocumentCount": 50,
    "totalDocuments": 1250,
    "isSyncing": false,
    "currentJobId": null
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/sync/status
```

---

## Analysis

### POST /api/v1/analysis

Trigger duplicate analysis. Returns 202 with the job ID. Only one analysis job can run at a time.

**Request body (optional):**

```json
{ "force": true }
```

Setting `force` to `true` regenerates all signatures and re-analyzes all documents, even those already processed.

**Response (202):**

```json
{
  "data": { "jobId": "01HQ3Y..." }
}
```

**Error (409):**

```json
{
  "error": {
    "code": "JOB_ALREADY_RUNNING",
    "message": "A job of type analysis is already running"
  }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/analysis

# Force re-analysis
curl -X POST http://localhost:3000/api/v1/analysis \
  -H 'Content-Type: application/json' \
  -d '{ "force": true }'
```

---

### GET /api/v1/analysis/status

Returns the current analysis state and whether analysis is in progress.

**Response:**

```json
{
  "data": {
    "lastAnalysisAt": "2025-01-15T08:05:00.000Z",
    "totalDuplicateGroups": 67,
    "isAnalyzing": false,
    "currentJobId": null
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/analysis/status
```

---

## Jobs

### GET /api/v1/jobs

List jobs with optional filters.

**Query parameters:**

| Parameter | Required | Description                                                                |
| --------- | -------- | -------------------------------------------------------------------------- |
| `type`    | No       | Filter by job type: `sync`, `analysis`, `batch_operation`                  |
| `status`  | No       | Filter by status: `pending`, `running`, `completed`, `failed`, `cancelled` |
| `limit`   | No       | Max results (1-200)                                                        |

**Response:**

```json
{
  "data": [
    {
      "id": "01HQ3X...",
      "type": "sync",
      "status": "completed",
      "progress": 100,
      "progressMessage": "Sync complete",
      "createdAt": "2025-01-15T08:00:00.000Z",
      "startedAt": "2025-01-15T08:00:01.000Z",
      "completedAt": "2025-01-15T08:02:30.000Z",
      "result": null,
      "error": null
    }
  ]
}
```

**curl:**

```bash
# All jobs
curl http://localhost:3000/api/v1/jobs

# Running sync jobs
curl "http://localhost:3000/api/v1/jobs?type=sync&status=running"
```

---

### GET /api/v1/jobs/:id

Get details for a specific job.

**Response:**

```json
{
  "data": {
    "id": "01HQ3X...",
    "type": "sync",
    "status": "running",
    "progress": 45,
    "progressMessage": "Fetching documents (450/1000)",
    "createdAt": "2025-01-15T08:00:00.000Z",
    "startedAt": "2025-01-15T08:00:01.000Z",
    "completedAt": null,
    "result": null,
    "error": null
  }
}
```

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Job '01HQ3X...' not found"
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/jobs/01HQ3X...
```

---

### GET /api/v1/jobs/:id/progress

Server-Sent Events (SSE) stream for real-time job progress. The connection stays open until the job completes, fails, or is cancelled.

**Event types:**

- `progress` -- Sent every 500ms while the job is running
- `complete` -- Sent once when the job reaches a terminal state, then the stream closes

**Event data:**

```json
{
  "progress": 45,
  "message": "Fetching documents (450/1000)",
  "status": "running"
}
```

**curl:**

```bash
curl -N http://localhost:3000/api/v1/jobs/01HQ3X.../progress
```

**JavaScript:**

```javascript
const source = new EventSource('/api/v1/jobs/01HQ3X.../progress');

source.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log(`${data.progress}% - ${data.message}`);
});

source.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Job ${data.status}: ${data.message}`);
  source.close();
});
```

---

### POST /api/v1/jobs/:id/cancel

Cancel a running or pending job.

**Response:**

```json
{
  "data": { "jobId": "01HQ3X...", "status": "cancelled" }
}
```

**Error (409 -- job already in terminal state):**

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Job '01HQ3X...' is already in a terminal state"
  }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/jobs/01HQ3X.../cancel
```

---

## Configuration

### GET /api/v1/config

Get all application configuration key-value pairs.

**Response:**

```json
{
  "data": {
    "dedup.numPermutations": "192",
    "dedup.similarityThreshold": "0.75",
    "schema_ddl_hash": "abc123..."
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/config
```

---

### PUT /api/v1/config

Set a single configuration key-value pair or a batch of settings.

**Request body (single):**

```json
{ "key": "dedup.similarityThreshold", "value": "0.8" }
```

**Request body (batch):**

```json
{
  "settings": {
    "dedup.similarityThreshold": "0.8",
    "dedup.numBands": "25"
  }
}
```

**Response:** Returns the full updated configuration (same as GET /config).

**curl:**

```bash
# Single setting
curl -X PUT http://localhost:3000/api/v1/config \
  -H 'Content-Type: application/json' \
  -d '{ "key": "dedup.similarityThreshold", "value": "0.8" }'

# Batch settings
curl -X PUT http://localhost:3000/api/v1/config \
  -H 'Content-Type: application/json' \
  -d '{ "settings": { "dedup.similarityThreshold": "0.8" } }'
```

---

### POST /api/v1/config/test-connection

Test connectivity to the Paperless-NGX instance. Uses the configured environment variables by default, or accepts explicit connection parameters.

**Request body (optional):**

```json
{
  "url": "http://paperless:8000",
  "token": "abc123..."
}
```

**Response (success):**

```json
{
  "data": {
    "connected": true,
    "version": "2.4.1",
    "documentCount": 1250
  }
}
```

**Response (failure, HTTP 502):**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Connection refused"
  }
}
```

**curl:**

```bash
# Test with configured env vars
curl -X POST http://localhost:3000/api/v1/config/test-connection

# Test with explicit params
curl -X POST http://localhost:3000/api/v1/config/test-connection \
  -H 'Content-Type: application/json' \
  -d '{ "url": "http://paperless:8000", "token": "abc123" }'
```

---

### GET /api/v1/config/dedup

Get the current deduplication algorithm configuration.

**Response:**

```json
{
  "data": {
    "numPermutations": 192,
    "numBands": 20,
    "ngramSize": 3,
    "minWords": 20,
    "similarityThreshold": 0.75,
    "confidenceWeightJaccard": 40,
    "confidenceWeightFuzzy": 30,
    "confidenceWeightMetadata": 15,
    "confidenceWeightFilename": 15,
    "fuzzySampleSize": 5000,
    "autoAnalyze": true
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/config/dedup
```

---

### PUT /api/v1/config/dedup

Update deduplication algorithm configuration. Accepts partial updates -- only include the fields you want to change. If confidence weights are changed, all existing duplicate group scores are recalculated automatically.

**Request body (partial):**

```json
{
  "similarityThreshold": 0.8,
  "confidenceWeightJaccard": 50,
  "confidenceWeightFuzzy": 30,
  "confidenceWeightMetadata": 10,
  "confidenceWeightFilename": 10
}
```

Note: When updating any confidence weight, ensure all four weights still sum to 100.

**Response:**

```json
{
  "data": {
    "numPermutations": 192,
    "numBands": 20,
    "ngramSize": 3,
    "minWords": 20,
    "similarityThreshold": 0.8,
    "confidenceWeightJaccard": 50,
    "confidenceWeightFuzzy": 30,
    "confidenceWeightMetadata": 10,
    "confidenceWeightFilename": 10,
    "fuzzySampleSize": 5000,
    "autoAnalyze": true
  },
  "meta": { "recalculatedGroups": 67 }
}
```

**Error (400 -- weights don't sum to 100):**

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Confidence weights must sum to 100"
  }
}
```

**curl:**

```bash
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{ "similarityThreshold": 0.8 }'
```

---

## Documents

### GET /api/v1/documents

List synced documents with optional filters and pagination.

**Query parameters:**

| Parameter          | Required | Default | Description                  |
| ------------------ | -------- | ------- | ---------------------------- |
| `limit`            | No       | 50      | Items per page (1-100)       |
| `offset`           | No       | 0       | Items to skip                |
| `correspondent`    | No       | --      | Filter by correspondent name |
| `documentType`     | No       | --      | Filter by document type      |
| `tag`              | No       | --      | Filter by tag                |
| `processingStatus` | No       | --      | `pending` or `completed`     |
| `search`           | No       | --      | Search in document titles    |

**Response:**

```json
{
  "data": [
    {
      "id": "doc-uuid-1",
      "paperlessId": 42,
      "title": "Invoice 2024-001",
      "correspondent": "Insurance Co",
      "documentType": "Invoice",
      "tags": ["finance", "2024"],
      "createdDate": "2024-03-15T00:00:00.000Z",
      "addedDate": "2024-03-16T10:00:00.000Z",
      "processingStatus": "completed",
      "originalFileSize": 245760,
      "archiveFileSize": 198400
    }
  ],
  "meta": { "total": 1250, "limit": 50, "offset": 0 }
}
```

**curl:**

```bash
curl "http://localhost:3000/api/v1/documents?limit=10&correspondent=Insurance%20Co"
```

---

### GET /api/v1/documents/:id

Get full details for a single document, including content and group memberships.

**Response:**

```json
{
  "data": {
    "id": "doc-uuid-1",
    "paperlessId": 42,
    "title": "Invoice 2024-001",
    "correspondent": "Insurance Co",
    "documentType": "Invoice",
    "tags": ["finance", "2024"],
    "createdDate": "2024-03-15T00:00:00.000Z",
    "addedDate": "2024-03-16T10:00:00.000Z",
    "modifiedDate": "2024-03-16T10:00:00.000Z",
    "processingStatus": "completed",
    "originalFileSize": 245760,
    "archiveFileSize": 198400,
    "fingerprint": "sha256-abc123...",
    "syncedAt": "2025-01-15T08:00:00.000Z",
    "content": {
      "fullText": "Invoice No. 2024-001...",
      "normalizedText": "invoice no 2024 001...",
      "wordCount": 342,
      "contentHash": "sha256-def456..."
    },
    "groupMemberships": [
      {
        "groupId": "group-uuid-1",
        "confidenceScore": 0.92,
        "isPrimary": true,
        "reviewed": false,
        "resolved": false
      }
    ]
  }
}
```

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Document not found: doc-uuid-1"
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/documents/doc-uuid-1
```

---

### GET /api/v1/documents/stats

Get aggregate statistics about synced documents.

**Response:**

```json
{
  "data": {
    "totalDocuments": 1250,
    "ocrCoverage": {
      "withContent": 1200,
      "withoutContent": 50,
      "percentage": 96.0
    },
    "processingStatus": { "pending": 10, "completed": 1240 },
    "correspondentDistribution": [
      { "name": "Insurance Co", "count": 150 },
      { "name": "Bank", "count": 120 }
    ],
    "documentTypeDistribution": [
      { "name": "Invoice", "count": 400 },
      { "name": "Letter", "count": 200 }
    ],
    "tagDistribution": [
      { "name": "finance", "count": 500 },
      { "name": "2024", "count": 300 }
    ],
    "totalStorageBytes": 524288000,
    "averageWordCount": 450
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/documents/stats
```

---

## Duplicates

### GET /api/v1/duplicates

List duplicate groups with optional filters and pagination.

**Query parameters:**

| Parameter       | Required | Default      | Description                                   |
| --------------- | -------- | ------------ | --------------------------------------------- |
| `limit`         | No       | 50           | Items per page (1-100)                        |
| `offset`        | No       | 0            | Items to skip                                 |
| `minConfidence` | No       | --           | Minimum confidence score (0-1)                |
| `maxConfidence` | No       | --           | Maximum confidence score (0-1)                |
| `reviewed`      | No       | --           | `true` or `false`                             |
| `resolved`      | No       | --           | `true` or `false`                             |
| `sortBy`        | No       | `confidence` | `confidence`, `created_at`, or `member_count` |
| `sortOrder`     | No       | `desc`       | `asc` or `desc`                               |

**Response:**

```json
{
  "data": [
    {
      "id": "group-uuid-1",
      "confidenceScore": 0.92,
      "reviewed": false,
      "resolved": false,
      "memberCount": 2,
      "primaryDocumentTitle": "Invoice 2024-001",
      "createdAt": "2025-01-15T08:05:00.000Z",
      "updatedAt": "2025-01-15T08:05:00.000Z"
    }
  ],
  "meta": { "total": 67, "limit": 50, "offset": 0 }
}
```

**curl:**

```bash
# High-confidence unresolved groups
curl "http://localhost:3000/api/v1/duplicates?minConfidence=0.9&resolved=false"

# Sort by member count
curl "http://localhost:3000/api/v1/duplicates?sortBy=member_count&sortOrder=desc"
```

---

### GET /api/v1/duplicates/:id

Get full details for a duplicate group, including all member documents.

**Response:**

```json
{
  "data": {
    "id": "group-uuid-1",
    "confidenceScore": 0.92,
    "jaccardSimilarity": 0.95,
    "fuzzyTextRatio": 0.88,
    "metadataSimilarity": 0.9,
    "filenameSimilarity": 0.85,
    "algorithmVersion": "1.0.0",
    "reviewed": false,
    "resolved": false,
    "createdAt": "2025-01-15T08:05:00.000Z",
    "updatedAt": "2025-01-15T08:05:00.000Z",
    "members": [
      {
        "memberId": "member-uuid-1",
        "documentId": "doc-uuid-1",
        "isPrimary": true,
        "paperlessId": 42,
        "title": "Invoice 2024-001",
        "correspondent": "Insurance Co",
        "documentType": "Invoice",
        "tags": ["finance", "2024"],
        "createdDate": "2024-03-15T00:00:00.000Z",
        "originalFileSize": 245760,
        "archiveFileSize": 198400,
        "content": {
          "fullText": "Invoice No. 2024-001...",
          "wordCount": 342
        }
      },
      {
        "memberId": "member-uuid-2",
        "documentId": "doc-uuid-2",
        "isPrimary": false,
        "paperlessId": 87,
        "title": "Invoice 2024-001 (copy)",
        "correspondent": "Insurance Co",
        "documentType": "Invoice",
        "tags": ["finance"],
        "createdDate": "2024-03-15T00:00:00.000Z",
        "originalFileSize": 245760,
        "archiveFileSize": 198400,
        "content": {
          "fullText": "Invoice No. 2024-001...",
          "wordCount": 340
        }
      }
    ]
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/duplicates/group-uuid-1
```

---

### GET /api/v1/duplicates/:id/content

Get the full text content for two documents in a group, for side-by-side comparison.

**Query parameters:**

| Parameter | Required | Description                        |
| --------- | -------- | ---------------------------------- |
| `docA`    | Yes      | Document ID of the first document  |
| `docB`    | Yes      | Document ID of the second document |

Both documents must be members of the specified group.

**Response:**

```json
{
  "data": {
    "docA": {
      "fullText": "Invoice No. 2024-001 from Insurance Co...",
      "wordCount": 342
    },
    "docB": {
      "fullText": "Invoice No. 2024-001 from Insurance Co...",
      "wordCount": 340
    }
  }
}
```

**curl:**

```bash
curl "http://localhost:3000/api/v1/duplicates/group-uuid-1/content?docA=doc-uuid-1&docB=doc-uuid-2"
```

---

### GET /api/v1/duplicates/stats

Get aggregate statistics about duplicate groups.

**Response:**

```json
{
  "data": {
    "totalGroups": 67,
    "reviewedGroups": 20,
    "resolvedGroups": 15,
    "unresolvedGroups": 52,
    "confidenceDistribution": [
      { "label": "90-100%", "min": 0.9, "max": 1.0, "count": 25 },
      { "label": "80-90%", "min": 0.8, "max": 0.9, "count": 18 },
      { "label": "70-80%", "min": 0.7, "max": 0.8, "count": 24 }
    ],
    "topCorrespondents": [
      { "correspondent": "Insurance Co", "groupCount": 12 },
      { "correspondent": "Bank", "groupCount": 8 }
    ]
  }
}
```

**curl:**

```bash
curl http://localhost:3000/api/v1/duplicates/stats
```

---

### DELETE /api/v1/duplicates/:id

Delete a duplicate group and its member associations. Does not delete the underlying documents.

**Response:**

```json
{
  "data": { "deleted": true }
}
```

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Duplicate group not found: group-uuid-1"
  }
}
```

**curl:**

```bash
curl -X DELETE http://localhost:3000/api/v1/duplicates/group-uuid-1
```

---

### PUT /api/v1/duplicates/:id/review

Mark a duplicate group as reviewed.

**Response:**

```json
{
  "data": { "groupId": "group-uuid-1", "reviewed": true }
}
```

**curl:**

```bash
curl -X PUT http://localhost:3000/api/v1/duplicates/group-uuid-1/review
```

---

### PUT /api/v1/duplicates/:id/resolve

Mark a duplicate group as resolved.

**Response:**

```json
{
  "data": { "groupId": "group-uuid-1", "resolved": true }
}
```

**curl:**

```bash
curl -X PUT http://localhost:3000/api/v1/duplicates/group-uuid-1/resolve
```

---

### PUT /api/v1/duplicates/:id/primary

Set the primary document for a duplicate group. The primary document is the one intended to be kept.

**Request body:**

```json
{ "documentId": "doc-uuid-1" }
```

**Response:**

```json
{
  "data": { "groupId": "group-uuid-1", "documentId": "doc-uuid-1" }
}
```

**Error (404):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Duplicate group not found: group-uuid-1"
  }
}
```

**curl:**

```bash
curl -X PUT http://localhost:3000/api/v1/duplicates/group-uuid-1/primary \
  -H 'Content-Type: application/json' \
  -d '{ "documentId": "doc-uuid-1" }'
```

---

## Batch Operations

### POST /api/v1/batch/review

Mark multiple duplicate groups as reviewed in a single request.

**Request body:**

```json
{
  "groupIds": ["group-uuid-1", "group-uuid-2", "group-uuid-3"]
}
```

The `groupIds` array must contain 1 to 1000 items.

**Response:**

```json
{
  "data": { "updated": 3 }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/batch/review \
  -H 'Content-Type: application/json' \
  -d '{ "groupIds": ["group-uuid-1", "group-uuid-2"] }'
```

---

### POST /api/v1/batch/resolve

Mark multiple duplicate groups as resolved in a single request.

**Request body:**

```json
{
  "groupIds": ["group-uuid-1", "group-uuid-2"]
}
```

**Response:**

```json
{
  "data": { "updated": 2 }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/batch/resolve \
  -H 'Content-Type: application/json' \
  -d '{ "groupIds": ["group-uuid-1", "group-uuid-2"] }'
```

---

### POST /api/v1/batch/delete-non-primary

Delete non-primary documents from Paperless-NGX for the specified groups. This is a destructive operation -- non-primary documents will be permanently deleted from Paperless-NGX.

Runs as a background job because it may take time for large batches.

**Request body:**

```json
{
  "groupIds": ["group-uuid-1", "group-uuid-2"],
  "confirm": true
}
```

The `confirm` field must be `true` (a safety check to prevent accidental deletions).

**Response (202):**

```json
{
  "data": { "jobId": "01HQ3Z..." }
}
```

**Error (409 -- batch operation already running):**

```json
{
  "error": {
    "code": "JOB_ALREADY_RUNNING",
    "message": "A job of type batch_operation is already running"
  }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/batch/delete-non-primary \
  -H 'Content-Type: application/json' \
  -d '{ "groupIds": ["group-uuid-1", "group-uuid-2"], "confirm": true }'
```

---

## Export & Import

### GET /api/v1/export/duplicates.csv

Export duplicate groups as a CSV file. Supports the same filters as `GET /api/v1/duplicates`.

**Query parameters:** Same as [GET /api/v1/duplicates](#get-apiv1duplicates) (minConfidence, maxConfidence, reviewed, resolved, sortBy, sortOrder).

**Response:** `text/csv` file download with `Content-Disposition` header.

**CSV columns:** `group_id`, `confidence_score`, `jaccard_similarity`, `fuzzy_text_ratio`, `metadata_similarity`, `filename_similarity`, `group_reviewed`, `group_resolved`, `is_primary`, `paperless_id`, `title`, `correspondent`, `document_type`, `tags`, `created_date`, `original_file_size`, `word_count`, `group_created_at`

**curl:**

```bash
# Export all groups
curl -o duplicates.csv http://localhost:3000/api/v1/export/duplicates.csv

# Export only high-confidence unresolved groups
curl -o duplicates.csv "http://localhost:3000/api/v1/export/duplicates.csv?minConfidence=0.9&resolved=false"
```

---

### GET /api/v1/export/config.json

Export the current application and dedup configuration as a JSON file for backup.

**Response:** `application/json` file download with `Content-Disposition` header.

**Response body:**

```json
{
  "version": "1.0",
  "exportedAt": "2025-01-15T10:00:00.000Z",
  "appConfig": {
    "dedup.numPermutations": "192",
    "dedup.similarityThreshold": "0.75"
  },
  "dedupConfig": {
    "numPermutations": 192,
    "numBands": 20,
    "similarityThreshold": 0.75
  }
}
```

**curl:**

```bash
curl -o config-backup.json http://localhost:3000/api/v1/export/config.json
```

---

### POST /api/v1/import/config

Import a previously exported configuration backup.

**Request body:** The JSON content from a config export (same shape as the export response).

**Response:**

```json
{
  "data": {
    "appConfigKeys": 5,
    "dedupConfigUpdated": true
  }
}
```

**curl:**

```bash
curl -X POST http://localhost:3000/api/v1/import/config \
  -H 'Content-Type: application/json' \
  -d @config-backup.json
```
