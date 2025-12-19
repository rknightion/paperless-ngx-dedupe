---
title: Troubleshooting
description: Common issues and fixes for sync, analysis, and AI processing.
---

# Troubleshooting

## Paperless connection errors

- Unauthorized: verify API token or username/password
- Connection refused: ensure the Paperless URL is reachable from the dedupe
  container (use the Docker service name, not localhost)

## Sync problems

- Sync already in progress: wait for completion or check the Dashboard
- Cannot sync while analysis is running: stop analysis or wait
- Force Refresh warning: this deletes local documents and analysis results, then re-imports all documents; re-run analysis after

## Deduplication analysis issues

- No documents available: run a sync first
- Analysis already running: check the Dashboard processing status, then refresh
- Slow analysis: reduce OCR max length or run on smaller subsets

## Duplicate review questions

- No groups found: lower the confidence threshold or adjust weights
- Delete group vs resolve: deleting a group removes the record, resolve deletes
  non-primary documents in Paperless-NGX

## AI Processing issues

- API key missing: add one in Settings
- OpenAI health check failed: confirm key and allowed model names
- Job fails quickly: reduce max input characters or use a smaller model
- Apply fails: ensure the Paperless connection is configured

## Background operations stuck

- Ensure the worker service is running
- Check logs for errors (docker compose logs -f paperless-dedupe-worker)
- Review the operation details from the Dashboard
