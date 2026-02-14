---
title: Getting Started
description: First run walkthrough for Paperless-Dedupe — sync documents, run analysis, and review duplicates
---

# Getting Started

!!! warning "Early Development"
    Paperless-Dedupe is in early development and is **not production-ready**. Features are incomplete, APIs will change, and data loss may occur. Do not use this against a Paperless-NGX instance you care about without backups.

This guide walks you through your first session with Paperless-Dedupe after [installation](installation.md). By the end, you will have synced your documents, identified duplicates, and reviewed them.

## First Run Walkthrough

### 1. Check the Dashboard

The dashboard at `/` shows the current state of your Paperless-Dedupe instance. On first launch, all counters will be zero.

### 2. Verify Connection

Navigate to **Settings** in the sidebar. Click **Test Connection** to verify Paperless-Dedupe can reach your Paperless-NGX instance. You should see the Paperless-NGX version and document count.

If the connection fails, see the [Troubleshooting Guide](troubleshooting.md#paperless-ngx-connection-issues).

### 3. Sync Documents

Navigate to **Settings** or the **Dashboard** and click **Sync**. This starts a background job that:

- Fetches all documents from your Paperless-NGX instance
- Extracts and normalizes text content
- Computes change fingerprints for incremental sync

Progress is shown in real-time via a progress bar. The first sync fetches all documents and may take a few minutes for large libraries.

### 4. Run Analysis

Once sync completes, click **Analyze** to run the deduplication pipeline. This:

- Generates MinHash signatures for each document
- Uses LSH (Locality-Sensitive Hashing) to find candidate pairs
- Scores candidates across four similarity dimensions
- Groups duplicates using union-find clustering

If the **autoAnalyze** option is enabled (the default), analysis runs automatically after each sync.

### 5. Review Duplicates

Navigate to **Duplicates** in the sidebar. You will see a list of duplicate groups sorted by confidence score. For each group:

- Click to open the detail view with side-by-side comparison
- View text diffs between documents
- Set the primary document (the one to keep)
- Mark as reviewed or resolved

### 6. Batch Operations

For large numbers of duplicates, use the **Bulk Operations Wizard** (button on the Duplicates page) to review, resolve, or delete non-primary documents in batch.

!!! danger "Destructive Action"
    The "Delete Non-Primary Documents" batch operation permanently removes documents from Paperless-NGX. Always verify your primary document selections before using this feature.

## What's Next

Now that you have completed your first run:

- [Configuration Reference](configuration.md) -- tune algorithm parameters and confidence weights
- [How It Works](how-it-works.md) -- understand the deduplication pipeline in detail
- [API Reference](api-reference.md) -- automate workflows with the REST API
- [SDK Reference](sdk-reference.md) -- use the TypeScript client library
- [CLI Reference](cli-reference.md) -- run operations from the command line
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
