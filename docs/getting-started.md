---
title: Getting Started
description: First run walkthrough for Paperless NGX Dedupe — sync documents, run analysis, and review duplicates
---

# Getting Started

!!! warning "Early Development"
    Paperless NGX Dedupe is in early development and is **not production-ready**. Features are incomplete, APIs will change, and data loss may occur. Do not use this against a Paperless-NGX instance you care about without backups.

This guide walks you through your first session with Paperless NGX Dedupe after [installation](installation.md). By the end, you will have synced your documents, identified duplicates, and reviewed them.

## First Run Walkthrough

### 1. Check the Dashboard

The dashboard at `/` shows the current state of your Paperless NGX Dedupe instance. On first launch, all counters will be zero.

### 2. Verify Connection

Navigate to **Settings** in the sidebar. Click **Test Connection** to verify Paperless NGX Dedupe can reach your Paperless-NGX instance. You should see the Paperless-NGX version and document count.

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
- Scores candidates using Jaccard and fuzzy text similarity with a discriminative penalty
- Groups duplicates using union-find clustering

Start analysis from the dashboard, or enable the Analysis schedule in Settings > Automation to run it automatically after each sync.

### 5. Review Duplicates

Navigate to **Duplicates** in the sidebar. You will see a list of duplicate groups sorted by confidence score. For each group:

- Click to open the detail view with side-by-side comparison
- View text diffs between documents
- Set the primary document (the one to keep)
- Dismiss as a false positive, keep all copies, or delete duplicates

### 6. Batch Operations

For large numbers of duplicates, use the **Bulk Operations Wizard** (button on the Duplicates page) to dismiss, ignore, or delete non-primary documents in batch.

!!! danger "Destructive Action"
    The "Delete Non-Primary Documents" batch operation moves documents to the Paperless-NGX recycle bin. Emptying that bin permanently removes them. Always verify your primary document selections before deleting.

## Undo a completed deletion

Use **Undo** on a completed deletion result or a row in the **Deleted** queue. The confirmation
shows the document and group counts for the entire deletion run: restoring from one row also
restores the other documents deleted by that same run. No restore starts until you confirm.

Restore runs as a background job. It reports how many documents were restored and how many are
no longer in the recycle bin. If the bin was already emptied, the result is **Nothing to restore**.
If another document mutation is running, wait for it to finish and retry. A restore cannot overlap
a delete job. Read-only deployments disable Undo.

Restored documents and their text return to the local database immediately, even if Paperless
keeps their original modified timestamp. Deleted groups remain as history. Run analysis again to
review the restored documents. Undo is available while the deletion checkpoints are retained and
the documents remain in the Paperless recycle bin; it does not cover individual document deletes
that bypassed a reviewed deletion plan.

## Trigger on consumption

To sync shortly after Paperless-NGX consumes documents:

1. Configure `APP_API_TOKEN` in the dedupe app's deployment environment and restart the app.
2. Open **Settings > Automation > Webhook sync**, enable **Sync when Paperless sends a webhook**,
   choose the quiet period and save. The default waits 60 seconds after the latest request.
3. In Paperless-NGX, create a workflow with trigger **Document Added** and action **Webhook**.
   Use the following action fields:

   | Field | Value |
   | --- | --- |
   | URL | `<dedupe-base-url>/api/v1/hooks/paperless` |
   | Body | `{}` |
   | Encoding | JSON |
   | Headers | `Authorization: Bearer <APP_API_TOKEN value>` and `Content-Type: application/json` |

   Use the dedupe app's API token, not the Paperless API credential. These fields match the
   [upstream Webhook action documentation](https://docs.paperless-ngx.com/usage/#webhook).
   Paperless may restrict webhook ports and local URLs; check its
   [workflow webhook configuration](https://docs.paperless-ngx.com/configuration/#workflow-webhooks)
   if it cannot reach your chosen URL.

Each accepted webhook returns 202 and restarts the quiet period. A burst produces one sync after
requests become quiet and the operation lease is available. A request arriving during a sync
remains pending for a later run. Jobs use the existing manual trigger. Run analysis manually or
use its configured schedule afterward. The ordinary Sync button and scheduled sync remain available.

For a document-specific request, send JSON with a numeric Paperless ID, for example
`{"documentId": 123}`. This fetches and refreshes that document directly, even if its modified
timestamp is older than the last sync. A burst combines IDs; a generic payload such as `{}`
requests a normal library sync instead. Selected-document refreshes do not advance the library
sync cursor. Missing documents are reported as skipped. See the
[webhook API](api-reference.md#post-apiv1hookspaperless) for the burst limit and
[Webhook Sync configuration](configuration.md#webhook-sync-optional) for timing settings.

## What's Next

Now that you have completed your first run:

- [Configuration Reference](configuration.md) -- tune algorithm parameters and confidence weights
- [How It Works](how-it-works.md) -- understand the deduplication pipeline in detail
- [API Reference](api-reference.md) -- automate workflows with the REST API
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
