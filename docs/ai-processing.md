---
title: AI Processing (OpenAI)
description: Use OpenAI to suggest document metadata from OCR content with a review-first workflow.
---

# AI Processing (OpenAI)

AI Processing uses OpenAI to extract metadata from OCR text and existing
metadata. This is the LLM-based categorization flow for Paperless-NGX Dedupe.
It proposes (but does not apply) updates for:
- Title
- Correspondent
- Document type
- Tags (up to 5)
- Date

All suggestions include confidence scores and remain in a pending review state
until you apply them.

Behavior details:
- Values may be null when evidence is missing
- Dates are ISO formatted (YYYY-MM-DD) when detected
- Suggestions are returned in English

## Requirements

- Paperless-NGX connection configured in Settings
- OpenAI API key configured in Settings (or via env var)

## Configuration options

In Settings > AI Processing:
- OpenAI API Key
- Model: gpt-5.1, gpt-5-mini, or gpt-5-nano
- Reasoning effort: low, medium, high
- Max OCR characters per document (default 12000)

The max input cap controls token usage and cost.

## Running a job

1. Open AI Processing
2. Choose a tag or process all documents
3. Select which fields to extract (or Everything)
4. Start processing

Jobs are queued and processed in the background. Progress is shown in the
Current run card, and completed results appear in the Results table.

## Reviewing results

Each row shows:
- Current document metadata
- Suggested values with confidence scores
- Status (pending_review, applied, failed)

You can:
- Select specific rows
- Choose which fields to apply
- Apply selected suggestions

Nothing is written to Paperless-NGX until you click Apply.

## Applying suggestions to Paperless-NGX

When you apply results:
- Titles, dates, and document types update the Paperless document
- Tags and correspondents are created in Paperless-NGX if missing
- The local cache is updated to match Paperless

If the Paperless connection is not configured, apply will fail.

## Health checks

The Verify OpenAI button checks that your API key and model are valid. It uses
model retrieval and does not consume tokens.

## Privacy and cost

OCR text and relevant metadata are sent to OpenAI. Use a key you control and
review privacy requirements for your documents. Reduce cost by:
- Using gpt-5-mini or gpt-5-nano
- Lowering the max OCR character limit
- Processing a single tag instead of all documents

## Common issues

- OpenAI API key missing: add a key in Settings
- Model not allowed: use gpt-5.1, gpt-5-mini, or gpt-5-nano
- Health check fails: verify network access and API key validity
- No results: ensure documents have OCR content and the job completed
