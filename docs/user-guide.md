---
title: User Guide
description: Navigate the Paperless-NGX Dedupe UI and complete the main workflows.
---

# User Guide

This guide mirrors the current UI and explains how each page maps to the
workflow.

## Navigation overview

The left navigation includes:
- Dashboard
- Documents
- Duplicates
- Bulk Wizard
- AI Processing
- Settings

## Dashboard

The Dashboard provides:
- System health and connection status
- Summary stats (total documents, duplicate groups, reviewed groups)
- Document Sync controls and sync status
- Processing controls for deduplication analysis
- Active and recent batch operations
- Potential storage savings estimate

Use this page as your main status hub.

## Documents

The Documents page is a library overview, not a list view. It reports:
- Total document counts and OCR coverage
- Organization stats (tags, correspondents, document types)
- Size distribution and sync recency

Refresh to update metrics after large syncs.

## Processing controls (Sync + Analysis)

The Dashboard includes two processing panels:

1) Document Sync
- Sync Documents: imports new items only
- Force Refresh: deletes local documents and duplicate analysis results, then re-imports everything from Paperless-NGX

Sync is disabled while analysis is running.
After a Force Refresh, run analysis again to refresh duplicate groups.

2) Deduplication Analysis
- Similarity threshold: overrides the default for this run
- Document limit: useful for testing subsets
- Force rebuild: deletes existing duplicate groups and re-analyzes all documents

Progress updates arrive via WebSocket. If the connection drops, the analysis
continues server-side and you can refresh status later.

## Duplicates

This page is where you review and resolve duplicate groups.

Key elements:
- Confidence score and per-signal breakdown
- Primary document indicator
- Compare view for side-by-side OCR and metadata
- Mark reviewed or unreviewed without deleting anything
- Delete group (removes only the group record, not documents)

Filters and sorting:
- Confidence threshold and fuzzy ratio
- Reviewed / unreviewed
- Search by title
- Facet filters for tags, correspondents, document types
- Optional page count and file size ranges

Bulk actions are available when multiple groups are selected:
- Mark reviewed / unreviewed
- Resolve (delete non-primary documents)
- Delete (same as resolve for groups)

## Bulk Wizard

The Bulk Wizard is a guided flow for resolving high-confidence groups:
1. Filter groups by confidence, tag, correspondent, or document type
2. Select groups and preview how many documents will be deleted
3. Choose to keep primary docs and optionally mark groups reviewed

It submits a batch operation that you can monitor from the Dashboard.

## AI Processing

AI Processing runs OpenAI on OCR text to suggest metadata. It is opt-in and
requires an API key in Settings. See ai-processing.md for a full walkthrough.

## Settings

Settings are divided into:
- Paperless-NGX connection
- AI Processing (OpenAI key, model, reasoning effort, OCR limit)
- Deduplication settings and confidence weights
- Advanced dedupe controls (LSH threshold, MinHash permutations)

Settings are stored in the application database and override environment
defaults.
