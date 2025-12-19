---
title: Configuration
description: Settings, environment variables, and advanced options for Paperless-NGX Dedupe.
---

# Configuration

Most configuration is handled in the web UI (Settings). Values are stored in
PostgreSQL and override environment defaults.

## Paperless-NGX connection

Settings fields:
- Paperless URL
- API token (recommended) OR username/password

Use Test Connection to validate credentials. This connection is required for:
- Document sync
- Applying AI metadata suggestions
- Bulk delete / resolve operations

## Deduplication settings

Core controls (Settings):
- Overall match threshold (weighted confidence score, 50-100)
- Max OCR text stored per document
- LSH threshold (advanced)
- MinHash permutations (advanced)
- Confidence weights (Jaccard, Fuzzy, Metadata)

Notes:
- Weights must sum to 100
- Changing weights triggers a full re-analysis
- Higher match thresholds reduce false positives but may miss near-duplicates

Advanced / API-only settings (not exposed in UI):
- enable_fuzzy_matching
- fuzzy_match_sample_size
- min_ocr_word_count

These can be set via the config API if needed.

## AI Processing settings

Settings fields:
- OpenAI API key
- Model: gpt-5.1, gpt-5-mini, gpt-5-nano
- Reasoning effort: low, medium, high
- Max OCR characters per document sent to OpenAI

AI settings are optional. Without an API key, AI Processing is disabled.

## Environment variables

All env vars use the PAPERLESS_DEDUPE_ prefix. Common ones:

- PAPERLESS_DEDUPE_DATABASE_URL
- PAPERLESS_DEDUPE_REDIS_URL
- PAPERLESS_DEDUPE_PAPERLESS_URL
- PAPERLESS_DEDUPE_PAPERLESS_API_TOKEN
- PAPERLESS_DEDUPE_PAPERLESS_USERNAME
- PAPERLESS_DEDUPE_PAPERLESS_PASSWORD
- PAPERLESS_DEDUPE_FETCH_METADATA_ON_SYNC (default false)
- PAPERLESS_DEDUPE_OPENAI_API_KEY
- PAPERLESS_DEDUPE_OPENAI_MODEL (default gpt-5-mini)
- PAPERLESS_DEDUPE_OPENAI_REASONING_EFFORT (default medium)
- PAPERLESS_DEDUPE_AI_MAX_INPUT_CHARS (default 12000)
- PAPERLESS_DEDUPE_LOG_LEVEL

For local development, copy env_sample to .env and update values.
