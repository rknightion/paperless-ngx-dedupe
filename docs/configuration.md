---
title: Configuration
description: Environment variables, authentication methods, and dedup algorithm settings for Paperless-Dedupe
---

# Configuration Reference

Paperless-Dedupe is configured through environment variables (set in your `.env` file or Docker Compose) and runtime deduplication settings (adjustable via the web UI or API).

## Environment Variables

These are read at startup and require a container restart to change.

| Variable              | Required | Default                      | Validation                       | Description                                                                                                                        |
| --------------------- | -------- | ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PAPERLESS_URL`       | Yes      | --                           | Must be a valid URL              | URL of your Paperless-NGX instance (e.g., `http://paperless:8000`)                                                                 |
| `PAPERLESS_API_TOKEN` | Yes\*    | --                           | String                           | Paperless-NGX API authentication token                                                                                             |
| `PAPERLESS_USERNAME`  | No       | --                           | String                           | Paperless-NGX username (alternative to token auth)                                                                                 |
| `PAPERLESS_PASSWORD`  | No       | --                           | String                           | Paperless-NGX password (used with `PAPERLESS_USERNAME`)                                                                            |
| `DATABASE_URL`        | No       | `./data/paperless-dedupe.db` | String                           | Path to the SQLite database file                                                                                                   |
| `PORT`                | No       | `3000`                       | Integer, 1-65535                 | Server listening port                                                                                                              |
| `LOG_LEVEL`           | No       | `info`                       | `debug`, `info`, `warn`, `error` | Application log verbosity                                                                                                          |
| `CORS_ALLOW_ORIGIN`   | No       | `` (empty)                   | String                           | CORS allowed origin. Empty = same-origin only, `*` = all origins                                                                   |
| `AUTO_MIGRATE`        | No       | `true`                       | `true` or `false`                | Run database schema migrations automatically on startup                                                                            |
| `ORIGIN`              | No       | --                           | URL string                       | SvelteKit production origin (e.g., `http://localhost:3000`). Required when running behind a reverse proxy or on a non-default URL. |

\* Either `PAPERLESS_API_TOKEN` **or** both `PAPERLESS_USERNAME` and `PAPERLESS_PASSWORD` must be provided.

## Authentication Methods

### API Token (Recommended)

Token authentication is the preferred method. It avoids transmitting your password and can be revoked independently.

```bash
PAPERLESS_URL=http://paperless:8000
PAPERLESS_API_TOKEN=abc123def456
```

### Username and Password

Basic authentication is supported as an alternative. Both fields are required.

```bash
PAPERLESS_URL=http://paperless:8000
PAPERLESS_USERNAME=admin
PAPERLESS_PASSWORD=your-password
```

If both an API token and username/password are provided, the API token takes precedence.

## Deduplication Algorithm Configuration

These settings control how the deduplication engine identifies and scores duplicates. They can be changed at runtime through the Settings page in the web UI or via the [PUT /api/v1/config/dedup](api-reference.md#put-apiv1configdedup) endpoint.

Changes to confidence weights trigger an automatic recalculation of all existing duplicate group scores.

### Algorithm Parameters

| Setting               | Default | Range      | Description                                                                                                                                                                |
| --------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numPermutations`     | `192`   | 16 -- 1024 | Number of MinHash permutations. Higher values produce more accurate signatures but use more memory and CPU.                                                                |
| `numBands`            | `20`    | 1 -- 100   | Number of LSH bands. More bands lower the similarity threshold for candidate detection (finds more pairs, including weaker matches). Must evenly divide `numPermutations`. |
| `ngramSize`           | `3`     | 1 -- 10    | Word n-gram size for shingling. 3 means each shingle is 3 consecutive words. Lower values are more sensitive to small changes.                                             |
| `minWords`            | `20`    | 1 -- 1000  | Minimum word count for a document to be analyzed. Documents with fewer words are skipped (they produce unreliable signatures).                                             |
| `similarityThreshold` | `0.75`  | 0.0 -- 1.0 | Minimum overall similarity score for a pair to be included in a duplicate group.                                                                                           |

### Confidence Weights

These four weights control how the overall confidence score is calculated. They are integers that **must sum to 100**.

| Setting                    | Default | Range    | Description                                                                     |
| -------------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `confidenceWeightJaccard`  | `40`    | 0 -- 100 | Weight for Jaccard text similarity (MinHash-based set overlap).                 |
| `confidenceWeightFuzzy`    | `30`    | 0 -- 100 | Weight for fuzzy text similarity (edit-distance based ratio on a sample).       |
| `confidenceWeightMetadata` | `15`    | 0 -- 100 | Weight for metadata similarity (correspondent, document type, date, file size). |
| `confidenceWeightFilename` | `15`    | 0 -- 100 | Weight for filename/title similarity.                                           |

### Other Settings

| Setting           | Default | Range          | Description                                                                                                            |
| ----------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `fuzzySampleSize` | `5000`  | 100 -- 100,000 | Number of characters sampled from each document for fuzzy text comparison. Larger values are more accurate but slower. |
| `autoAnalyze`     | `true`  | `true`/`false` | Automatically run analysis after each successful sync.                                                                 |

### Example: Adjusting for a Specific Workflow

To prioritize text content similarity and ignore metadata:

```bash
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{
    "confidenceWeightJaccard": 50,
    "confidenceWeightFuzzy": 40,
    "confidenceWeightMetadata": 5,
    "confidenceWeightFilename": 5
  }'
```

To catch near-duplicates with lower thresholds:

```bash
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{ "similarityThreshold": 0.5, "numBands": 30 }'
```

## Docker-Specific Configuration

### Volume Mount

The SQLite database is stored at `/app/data/` inside the container. Mount a Docker volume to persist data across container restarts:

```yaml
volumes:
  - app-data:/app/data
```

### Health Check

The container includes a built-in health check that polls `GET /api/v1/health` every 30 seconds:

```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
```

Use `GET /api/v1/ready` for a deeper readiness check that validates both database and Paperless-NGX connectivity.

### Non-Root User

The container runs as a non-root user (UID 1001, GID 1001). If you mount a host directory instead of a named volume, ensure the directory is writable by UID 1001:

```bash
mkdir -p ./data
chown 1001:1001 ./data
```

### Read-Only Filesystem

The default `docker-compose.yml` uses `read_only: true` for security. The container only needs write access to `/app/data` (via the volume) and `/tmp` (via tmpfs). If you encounter "read-only filesystem" errors, verify both the volume mount and tmpfs are configured.

### Reverse Proxy

When running behind a reverse proxy (nginx, Traefik, Caddy), set the `ORIGIN` environment variable to the external URL:

```bash
ORIGIN=https://dedupe.example.com
```

This is a SvelteKit requirement for CSRF protection. Without it, form submissions and POST requests may be rejected.
