# AI Apply Failure Visibility

**Date:** 2026-04-04
**Status:** Draft

## Problem

When applying AI-suggested metadata to Paperless-NGX documents fails (API errors, network issues, entity resolution failures), the error information is stored in the database (`errorMessage` and `appliedStatus = 'failed'`) but is poorly surfaced in the UI:

- **AiResultRow** shows only a tiny "Error" badge with the error hidden in a hover tooltip
- **AiResultDetailDrawer** shows no error information at all for failed results
- **Queue page** truncates the error message to a single line with `text-xs truncate`

Users cannot easily understand what went wrong or take action to fix it.

## Scope

Enhance existing UI components to make error information visible and actionable. No new pages, no new database schema, no new API routes.

### In Scope

- AiResultDetailDrawer error banner with full error message and retry
- AiResultRow inline error display replacing tooltip-only badge
- Queue page failed section error message wrapping
- Retry action for apply-phase failures

### Out of Scope

- Error categorization or human-friendly guidance messages
- New "Failures" page or tab
- Schema changes or new failure types
- Real-time toast notifications for apply failures

## Design

### 1. AiResultDetailDrawer — Error Banner

When `appliedStatus === 'failed'`, render a prominent error banner between the header and the suggestions section.

**Banner contents:**
- Red `AlertCircle` icon + "Apply Failed" heading
- Full `errorMessage` text displayed as a readable block (not truncated)
- `failureType` as a small badge if present (e.g. `timeout`, `rate_limit`, `no_suggestions`)

**Footer:**
- When `appliedStatus === 'failed'`, show a "Retry" button in the sticky footer (same position as the Apply/Reject buttons for `pending_review` results)
- Retry calls `POST /api/v1/ai/results/{id}/apply` with default fields

The suggestions section still renders below the error banner so the user can see what was attempted alongside why it failed.

**File:** `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`

### 2. AiResultRow — Inline Error Display

Replace the tooltip-only "Error" badge in the confidence column with visible error information.

**When `result.errorMessage` is set:**
- Show the failure type badge: "Failed" (red) or "No Suggestions" (yellow), same styling as today
- Below the badge, show `errorMessage` in `text-xs text-muted` with `line-clamp-2` to keep the table compact
- Remove the `Tooltip` wrapper and `cursor-help` — the error text is now directly visible

The full error message remains readable in the detail drawer when the user clicks the row.

**File:** `packages/web/src/lib/components/ai/AiResultRow.svelte` (lines 160-167)

### 3. Queue Page Failed Section — Error Message Wrapping

The queue page's failed results section already shows `result.errorMessage` but truncates it aggressively.

**Changes:**
- Remove the `truncate` CSS class from the error message `<span>`
- Add `line-clamp-3` so the message wraps up to 3 lines before truncating
- Verify the existing retry button works for apply-phase failures (not just AI extraction failures) — the `handleRetryOne` function uses `startProcessingWithScope` which re-runs AI processing, so for apply failures we need to ensure this re-triggers the apply step as well, or add a separate "Retry Apply" action

**File:** `packages/web/src/routes/ai-processing/queue/+page.svelte` (lines 438-479)

### 4. History Page — No Changes

The history page uses the same `AiResultRow` and `AiResultDetailDrawer` components. The existing `failed=true` filter continues to work. Enhanced error display comes for free from changes to the shared components.

## Data Availability

Both `AiResultSummary` and `AiResultDetail` (defined in `packages/core/src/ai/queries.ts`) already include `errorMessage: string | null` and `failureType: string | null`. No API or schema changes are needed — the data is fetched but not rendered.

## Retry Behavior

Two distinct retry actions exist, each appropriate to a different context:

1. **Drawer "Retry Apply" button** — calls `POST /api/v1/ai/results/{id}/apply` to re-attempt applying the existing AI suggestions to Paperless-NGX. Appropriate when the AI extraction succeeded but the Paperless API call failed (network timeout, server error, etc.). The drawer already receives an `onapply` callback from the parent page.

2. **Queue page "Retry" button** — calls `startProcessingWithScope` to re-run AI extraction from scratch. This is a heavier operation that produces fresh suggestions. Appropriate when the AI extraction itself failed. No changes needed here.

## Files Changed

| File | Change |
|------|--------|
| `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte` | Add error banner section, add retry button in footer for failed results |
| `packages/web/src/lib/components/ai/AiResultRow.svelte` | Replace tooltip error badge with inline error text + failure type badge |
| `packages/web/src/lib/components/ai/AiResultCard.svelte` | Same change as AiResultRow — replace tooltip error badge with inline error text (this component has the same pattern at lines 108-115) |
| `packages/web/src/routes/ai-processing/queue/+page.svelte` | Remove truncate, add line-clamp-3 on error messages |
