---
title: Comparison
description: When Paperless NGX Dedupe is worth running alongside Paperless-NGX, and when the built-in checksum check or a manual review are enough.
---

# When to Use This

There is more than one way to deal with duplicate documents in a Paperless-NGX library. This
page describes what Paperless NGX Dedupe is built for, so you can judge whether it earns its
place in your deployment.

## What Paperless NGX Dedupe does

It finds **near-duplicates already in your library** — documents that are not byte-identical but
share most of their content: a document scanned twice with slightly different OCR output, a
monthly bank statement or invoice that reuses the same template with different dates and
amounts, or an outbound and return travel ticket from the same booking. It does this by
shingling document text, compressing it into MinHash signatures, using Locality-Sensitive
Hashing to find candidate pairs across the whole library without an O(n²) comparison, then
scoring and clustering candidates for review in a web UI with side-by-side diffs. See [How It
Works](how-it-works.md).

Nothing is deleted automatically: duplicate groups are presented for review, and the batch
delete operation is an explicit, confirmed action against groups you have already reviewed. See
[Architecture — Review Flow](architecture.md#review-flow).

## Paperless-NGX's own duplicate handling

Paperless-NGX detects **exact duplicates at ingest time** using a document checksum, and skips
re-consuming a file that is byte-identical to one already in the library. That check runs
automatically as part of the consumption pipeline and requires no extra service.

What it does not cover is the case this project targets: two files that are *not*
byte-identical — different scans of the same paper document, re-OCRed pages, or template-based
documents with different substantive content — but which a human would still call duplicates or
near-duplicates. A checksum comparison cannot see that; it only catches the exact-match case.

**If your problem is only avoiding re-ingesting the same file twice, Paperless-NGX's built-in
checksum check already covers it and you likely do not need this project.**

## Doing it by hand

For a handful of documents, opening two files side by side and comparing them works fine.  It
stops working as the library grows: finding near-duplicate candidates across thousands of
documents by eye is impractical, and monthly statements or tickets that share a template are
easy to miss or to misjudge as different (or the same) without a text-similarity score to anchor
the decision. This is the gap the MinHash/LSH pipeline and the discriminative penalty are
designed to close — see the [discriminative penalty](how-it-works.md#step-5-similarity-scoring)
for how template-sharing documents with different dates, amounts, or reference numbers are
distinguished from genuine duplicates.

## When to use this

- Your library has near-duplicates that are not byte-identical: rescans, re-OCRed documents, or
  recurring templated documents (invoices, statements, tickets) that Paperless-NGX's checksum
  check will never flag.
- You want a reviewable confidence score and a side-by-side diff before removing anything, not
  an automatic delete.
- You also want optional AI-suggested metadata (correspondent, document type, tags) for the same
  library, reviewed before it is applied. See [AI Processing](ai-processing.md).

## When not to

- You only need to stop re-ingesting the exact same file — Paperless-NGX's checksum check on
  consumption already does that with no extra service to run.
- You are not comfortable running an early-development companion service against a library you
  care about without a backup. See the warning in [Getting Started](getting-started.md).
- You need duplicate detection to run with zero configuration. Good results on a real library
  usually mean tuning `similarityThreshold`, the confidence weights, and
  `discriminativePenaltyStrength` — see the [Tuning Guide](how-it-works.md#tuning-guide).

## See Also

- [How It Works](how-it-works.md) — the deduplication pipeline in detail
- [Architecture](architecture.md) — monorepo structure and data flow
- [Security](security.md) — credential scope and what leaves the deployment
