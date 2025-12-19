---
title: Paperless-NGX Dedupe
description: Duplicate detection and AI metadata extraction for paperless-ngx
image: assets/social-card.png
---

# Paperless-NGX Dedupe

<div class="hero">
  <p>Find and resolve duplicate documents with MinHash/LSH and fuzzy OCR matching, then add AI metadata suggestions when you are ready.</p>
  <div class="hero-badges">
    <a class="md-button md-button--primary md-button--stretch" href="getting-started/">Get Started</a>
    <a class="md-button md-button--primary md-button--stretch" href="user-guide/">Explore the UI</a>
    <a class="md-button md-button--primary md-button--stretch" href="ai-processing/">AI Processing</a>
  </div>
</div>

## What it does

Paperless-NGX Dedupe connects to your paperless-ngx instance, syncs documents, analyzes content similarity, and groups likely duplicates. You can review groups in the UI, resolve duplicates safely, and optionally run OpenAI-based metadata extraction for titles, tags, correspondents, document types, and dates as part of the LLM-based categorization workflow.

## Quick start

1. Start the stack with Docker (see the root README for compose examples).
2. Open the UI at http://localhost:30002 and configure your Paperless-NGX connection.
3. Sync documents, then run deduplication analysis from the Dashboard controls.
4. Review and resolve duplicates from the Duplicates page.
5. (Optional) Add an OpenAI key in Settings and run AI Processing.

## Documentation map

- [Getting Started](getting-started.md) - setup and first run
- [User Guide](user-guide.md) - UI walkthrough and workflows
- [AI Processing](ai-processing.md) - metadata suggestions with OpenAI
- [Configuration](configuration.md) - settings and environment variables
- [Troubleshooting](troubleshooting.md) - common issues and fixes

## API reference

When the backend is running, interactive API documentation is available at http://localhost:30001/docs.
