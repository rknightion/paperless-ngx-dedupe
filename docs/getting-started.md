---
title: Getting Started
description: Configure the Paperless-NGX connection, sync documents, and run your first analysis.
---

# Getting Started

This guide assumes the stack is already running (see the project README for
Docker and local setup options).

## 1) Configure Paperless-NGX connection

1. Open the Web UI at http://localhost:30002
2. Go to Settings
3. Enter your Paperless-NGX URL
4. Add either an API token or username + password
5. Click Test Connection

The connection is required for document sync, duplicate review actions, and
applying AI suggestions.

## 2) Sync documents

Use the Document Sync card on the Dashboard:

- Sync Documents: imports only new documents since the last sync
- Force Refresh: deletes local documents and duplicate analysis results, then re-imports everything from Paperless-NGX

After a Force Refresh, run deduplication analysis again to refresh groups.

## 3) Run deduplication analysis

Use the Processing controls on the Dashboard and start analysis. You can optionally set:

- Similarity threshold (default uses your Settings value)
- Document limit (useful for testing)
- Force rebuild (re-analyzes all documents and clears prior results)

## 4) Review duplicate groups

Go to Duplicates to review groups, compare documents, and resolve or delete
non-primary documents. You can also mark groups as reviewed without deleting
anything.

## 5) Optional bulk resolution

Use the Bulk Wizard for high-confidence cleanups. It walks you through filtering
and estimating impact before running a bulk resolve.

## 6) Optional AI metadata extraction (OpenAI)

1. In Settings, add your OpenAI API key and choose a model
2. Open AI Processing and start a job (tag or all documents)
3. Review suggestions and apply only the fields you want

AI results are never applied automatically.

## 7) Monitor background operations

The Dashboard shows active and recent batch operations (syncs, deletes, bulk
resolves). Click into any operation to see progress and errors.
