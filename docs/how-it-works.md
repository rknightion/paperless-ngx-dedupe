---
title: How It Works
description: The MinHash/LSH deduplication pipeline — shingling, signatures, candidate detection, scoring, and clustering
---

# How It Works

Paperless NGX Dedupe uses a multi-stage pipeline to identify duplicate documents efficiently. This page explains each stage in plain terms.

## Overview

The pipeline works in three broad phases:

1. **Sync** documents from Paperless-NGX and prepare their text
2. **Index** documents using probabilistic data structures (MinHash + LSH) to find candidate pairs without comparing every document to every other
3. **Score and group** candidates using Jaccard similarity, fuzzy text matching, and a discriminative penalty, then cluster them for review

```mermaid
flowchart LR
    A[Sync] --> B[Shingle]
    B --> C[MinHash]
    C --> D[LSH]
    D --> E[Score]
    E --> F[Cluster]
    style A fill:#e8eaf6,stroke:#3f51b5
    style B fill:#e8eaf6,stroke:#3f51b5
    style C fill:#e8eaf6,stroke:#3f51b5
    style D fill:#e8eaf6,stroke:#3f51b5
    style E fill:#e8eaf6,stroke:#3f51b5
    style F fill:#e8eaf6,stroke:#3f51b5
```

## Step 1: Document Sync

When you trigger a sync, Paperless NGX Dedupe fetches documents from your Paperless-NGX instance via its REST API.

For each document, the sync process:

- Stores metadata (title, correspondent, document type, tags, dates)
- Extracts the full OCR text content
- Normalizes the text: lowercases, strips punctuation, collapses whitespace
- Computes a fingerprint (hash of the normalized text) so future syncs can skip unchanged documents

After the first full sync, incremental syncs only fetch documents that have changed.

## Step 2: Shingling

Before comparing documents, the normalized text is split into overlapping word groups called **shingles** (also known as n-grams).

With the default `ngramSize` of 3, the sentence "the quick brown fox jumps" produces these shingles:

- "the quick brown"
- "quick brown fox"
- "brown fox jumps"

Each document becomes a **set of shingles**. Two documents that share many shingles have similar content, measured by the Jaccard similarity:

\[
J(A, B) = \frac{|A \cap B|}{|A \cup B|}
\]

The shingle set is the foundation for all subsequent steps.

Documents with fewer words than `minWords` (default: 20) are skipped because short documents produce too few shingles for reliable comparison.

## Step 3: MinHash Signatures

Comparing shingle sets directly is expensive -- each set can contain thousands of entries, and comparing every pair of documents would be O(n^2).

MinHash compresses each shingle set into a compact fixed-size **signature** (a list of 256 numbers by default, controlled by `numPermutations`). The key property is:

> The probability that two MinHash signatures agree at any position equals the Jaccard similarity of the original shingle sets.

This means we can estimate how similar two documents are by comparing their short signatures instead of their full shingle sets. The more permutations, the more accurate the estimate, but at the cost of more memory and CPU.

## Step 4: Locality-Sensitive Hashing (LSH)

Even with compact signatures, comparing every pair of documents is still O(n^2). LSH solves this by only comparing documents that are **likely** to be similar.

The technique works by dividing each signature into **bands** (default: 32). Each band is a short segment of the signature. Documents are placed into hash buckets based on each band. Two documents that land in the same bucket for _any_ band become a **candidate pair**.

The band/row structure creates an S-curve probability threshold:

- Document pairs with high similarity are almost certain to be candidates
- Pairs with low similarity are almost certain to be filtered out
- The transition region depends on the number of bands and rows per band

With 256 permutations and 32 bands, the effective candidate funnel is tuned for moderate recall before the final `similarityThreshold` filter (default: 0.75) removes weaker matches.

## Step 5: Similarity Scoring

Each candidate pair from LSH is scored using a **2-weight base score** with a **discriminative penalty**:

### Base score (weighted average)

1. **Jaccard Similarity** (default weight: 60) -- Set overlap of shingle sets, estimated from MinHash signatures. Measures how much text content the two documents share.

2. **Fuzzy Text Similarity** (default weight: 40) -- Edit-distance-based ratio computed on a character sample of the normalized text (controlled by `fuzzySampleSize`). Catches cases where documents have similar content but different word order or minor variations.

The two weights are normalized (they must sum to 100) to produce a base score:

```
base = (jaccard × J_weight + fuzzy × F_weight) / (J_weight + F_weight)
```

### Discriminative penalty

3. **Discriminative Score** -- Extracts structured data from both documents and compares the token sets. This targets template-based documents that share most of their text but differ in key details. The classifier detects:

      - **Dates** (all common formats including DD-Mon-YYYY, ISO, month names)
      - **Monetary amounts** (with currency symbols, codes, or near financial keywords)
      - **Identifiers** (invoice/order/ticket/tracking numbers, booking refs, account IDs)
      - **Reference numbers** (6+ digit sequences, dash-separated digit groups)
      - **Routes** (directional travel codes like `Out: BSK - LON` vs `Ret: LON - BSK`)

      This is particularly effective for monthly invoices, bank statements, utility bills, and train/flight tickets where the template is identical but dates, amounts, reference numbers, or routes differ between documents.

The discriminative score acts as a **multiplicative penalty** on the base score:

```
final = base × (1 - penalty_strength/100 × (1 - discriminative_score))
```

When `discriminativePenaltyStrength` is 0, the penalty is disabled and the final score equals the base. At the default strength of 70, a pair with a low discriminative score (e.g., 0.2) would have its base score reduced by 56%. This helps filter out false positives where documents share common templates but have different substantive content.

!!! tip "Train and flight tickets"
    Outbound and return tickets from the same journey often share 95%+ of their text, differing only in route direction. The discriminative classifier detects reversed route codes (e.g., `BSK - LON` vs `LON - BSK`) and penalizes these pairs. If your library contains many travel documents, consider increasing the penalty strength to 80-90%.

Pairs scoring below `similarityThreshold` (default: 0.75) are discarded.

## Step 6: Clustering

Scored pairs are grouped into clusters using a **union-find** (disjoint-set) data structure. If document A is similar to B, and B is similar to C, all three end up in the same group -- even if A and C were not directly compared.

Each cluster becomes a **duplicate group** in the database with:

- A confidence score (averaged across all scored pairs in the group)
- Individual similarity dimension scores (Jaccard, fuzzy, discriminative)
- Member documents with a designated primary (the document with the lowest Paperless-NGX ID)

Groups are presented in the web UI for review, sorted by confidence.

## Tuning Guide

### Too many false positives (unrelated documents grouped together)

- **Raise `similarityThreshold`** (e.g., 0.85 or 0.90) to require stronger matches
- **Increase `discriminativePenaltyStrength`** (e.g., 80-100) to penalize pairs that share boilerplate but differ in dates, amounts, or references. Especially useful for monthly invoices and train/flight tickets
- **Adjust confidence weights** to shift emphasis between Jaccard and fuzzy text matching
- **Reduce `numBands`** to narrow the LSH candidate funnel

### Missing obvious duplicates

- **Lower `similarityThreshold`** (e.g., 0.60) to allow weaker matches through
- **Reduce `discriminativePenaltyStrength`** (e.g., 0-30) if the penalty is filtering out legitimate duplicates that happen to have minor OCR differences in dates or amounts
- **Increase `numBands`** to widen the candidate funnel
- **Lower `minWords`** if short documents are being skipped
- **Check `ngramSize`** -- a smaller value (2) is more sensitive to small differences

### Slow analysis on large libraries

- **Reduce `numPermutations`** (e.g., 128) for faster signature generation at the cost of some accuracy
- **Reduce `fuzzySampleSize`** (e.g., 2000) to speed up fuzzy text comparison
- **Increase `similarityThreshold`** to reduce the number of pairs that need scoring

### Understanding the relationship between bands and permutations

`numPermutations` must be evenly divisible by `numBands`. The number of rows per band is `numPermutations / numBands`. More rows per band means a higher effective LSH threshold (fewer candidates, higher precision). More bands means a lower effective threshold (more candidates, higher recall).

| Permutations | Bands | Rows/Band | Effect |
| ------------ | ----- | --------- | ------ |
| 256          | 32    | 8         | Default balance of recall/precision |
| 256          | 16    | 16        | Fewer candidates, higher precision |
| 128          | 16    | 8         | Faster, with less stable estimates |
| 512          | 32    | 16        | More stable estimates, higher CPU |

## See Also

- [Architecture](architecture.md) -- monorepo structure, data flow diagrams, and database schema
- [Configuration](configuration.md) -- all algorithm parameters with ranges and defaults
