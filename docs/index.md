---
title: Paperless-Dedupe Documentation
description: Document deduplication companion for Paperless-NGX using MinHash/LSH algorithms
image: assets/social-card.png
---

# Paperless-Dedupe

**Intelligent document deduplication for Paperless-NGX**

## Features

### :material-magnify-scan: Intelligent Detection

MinHash signatures combined with Locality-Sensitive Hashing provide efficient O(n log n) candidate discovery — no need to compare every document against every other.

### :material-chart-bar: Multi-Dimensional Scoring

Four similarity dimensions — Jaccard text overlap, fuzzy text matching, metadata comparison, and filename similarity — are combined into a single confidence score with configurable weights.

### :material-lightning-bolt: Real-Time Processing

Background worker threads handle sync, analysis, and batch operations with real-time progress streamed via Server-Sent Events.

### :material-docker: Single Container

Deploy with Docker Compose using an embedded SQLite database. No Redis, no Postgres, no external dependencies beyond Paperless-NGX itself.

## Quick Start

```bash
# 1. Create your configuration
cp .env.example .env
# Edit .env — set PAPERLESS_URL and PAPERLESS_API_TOKEN

# 2. Start the application
docker compose up -d

# 3. Open the web UI
open http://localhost:3000

# 4. Sync → Analyze → Review duplicates
```

See the [Getting Started Guide](getting-started.md) for a full walkthrough.

---

## Explore the Documentation

<div class="grid cards" markdown>

-   :material-rocket-launch:{ .lg .middle } **Getting Started**

    ---

    First run walkthrough — sync documents, run analysis, and review duplicates

    [:octicons-arrow-right-24: Quick start](getting-started.md)

-   :material-cog:{ .lg .middle } **Configuration**

    ---

    Environment variables, authentication methods, and algorithm tuning parameters

    [:octicons-arrow-right-24: Configure](configuration.md)

-   :material-api:{ .lg .middle } **API Reference**

    ---

    Complete REST API documentation with curl examples for every endpoint

    [:octicons-arrow-right-24: API docs](api-reference.md)

-   :material-brain:{ .lg .middle } **How It Works**

    ---

    The deduplication pipeline — shingling, MinHash, LSH, scoring, and clustering

    [:octicons-arrow-right-24: Learn more](how-it-works.md)

-   :material-language-typescript:{ .lg .middle } **SDK Reference**

    ---

    TypeScript client library for programmatic access to the Paperless-Dedupe API

    [:octicons-arrow-right-24: SDK docs](sdk-reference.md)

-   :material-console:{ .lg .middle } **CLI Reference**

    ---

    Command-line interface for sync, analysis, configuration, and data export

    [:octicons-arrow-right-24: CLI docs](cli-reference.md)

</div>

## Community & Support

- **GitHub**: [rknightion/paperless-ngx-dedupe](https://github.com/rknightion/paperless-ngx-dedupe)
- **Issues**: [Report bugs or request features](https://github.com/rknightion/paperless-ngx-dedupe/issues)
- **Discussions**: [Community discussions](https://github.com/rknightion/paperless-ngx-dedupe/discussions)
- **Paperless-NGX**: [Official Paperless-NGX project](https://github.com/paperless-ngx/paperless-ngx)
