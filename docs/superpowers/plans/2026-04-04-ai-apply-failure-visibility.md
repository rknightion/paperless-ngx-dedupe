# AI Apply Failure Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI apply failure error messages visible and actionable across all UI surfaces instead of hiding them in tooltips.

**Architecture:** Pure frontend changes to 4 existing Svelte components plus the history page's inline drawer. No schema, API, or core library changes. The `errorMessage` and `failureType` fields already exist on `AiResultSummary` and `AiResultDetail` types — they're fetched but not rendered.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind CSS, lucide-svelte icons

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/web/src/lib/components/ai/AiResultRow.svelte` | Modify lines 160-167 | Replace tooltip error badge with inline error text |
| `packages/web/src/lib/components/ai/AiResultCard.svelte` | Modify lines 108-115 | Same as AiResultRow — replace tooltip with inline error text |
| `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte` | Modify: add section after line 279, modify footer after line 396 | Add error banner + retry footer for failed results |
| `packages/web/src/routes/ai-processing/queue/+page.svelte` | Modify lines 447, 456 | Remove truncation, allow error messages to wrap |
| `packages/web/src/routes/ai-processing/history/+page.svelte` | Modify: add section after line 387, add footer after line 438 | Add error banner + retry to history's inline drawer |

---

### Task 1: AiResultRow — Inline Error Display

**Files:**
- Modify: `packages/web/src/lib/components/ai/AiResultRow.svelte:1-3` (imports)
- Modify: `packages/web/src/lib/components/ai/AiResultRow.svelte:160-167` (error display)

- [ ] **Step 1: Update imports — remove Tooltip, keep AlertCircle**

In `packages/web/src/lib/components/ai/AiResultRow.svelte`, line 2, change:

```svelte
  import { ConfidenceBadge, Tooltip } from '$lib/components';
```

to:

```svelte
  import { ConfidenceBadge } from '$lib/components';
```

Note: Only remove `Tooltip` if it's not used elsewhere in the file. Check first — it's only used in the error block (lines 161-167), so it's safe to remove.

- [ ] **Step 2: Replace tooltip error badge with inline error display**

In `packages/web/src/lib/components/ai/AiResultRow.svelte`, replace lines 160-167:

```svelte
    {:else if result.errorMessage}
      <Tooltip text={result.errorMessage} position="left">
        <span
          class="bg-ember-light text-ember inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        >
          <AlertCircle class="h-3 w-3" /> Error
        </span>
      </Tooltip>
```

with:

```svelte
    {:else if result.errorMessage}
      <div class="space-y-1">
        {#if result.failureType === 'no_suggestions'}
          <span class="bg-warn-light text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <AlertCircle class="h-3 w-3" /> No Suggestions
          </span>
        {:else}
          <span class="bg-ember-light text-ember inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <AlertCircle class="h-3 w-3" /> Failed
          </span>
        {/if}
        <p class="text-muted line-clamp-2 text-xs">{result.errorMessage}</p>
      </div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm check`
Expected: No type errors related to AiResultRow

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/components/ai/AiResultRow.svelte
git commit -m "feat(ui): show inline error message in AiResultRow instead of tooltip"
```

---

### Task 2: AiResultCard — Inline Error Display

**Files:**
- Modify: `packages/web/src/lib/components/ai/AiResultCard.svelte:1-3` (imports)
- Modify: `packages/web/src/lib/components/ai/AiResultCard.svelte:108-115` (error display)

- [ ] **Step 1: Update imports — remove Tooltip**

In `packages/web/src/lib/components/ai/AiResultCard.svelte`, line 2, change:

```svelte
  import { ConfidenceBadge, Tooltip } from '$lib/components';
```

to:

```svelte
  import { ConfidenceBadge } from '$lib/components';
```

- [ ] **Step 2: Replace tooltip error badge with inline error display**

In `packages/web/src/lib/components/ai/AiResultCard.svelte`, replace lines 108-115:

```svelte
        {:else if result.errorMessage}
          <Tooltip text={result.errorMessage} position="left">
            <span
              class="bg-ember-light text-ember inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            >
              <AlertCircle class="h-3 w-3" /> Error
            </span>
          </Tooltip>
```

with:

```svelte
        {:else if result.errorMessage}
          <div class="space-y-1">
            {#if result.failureType === 'no_suggestions'}
              <span class="bg-warn-light text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <AlertCircle class="h-3 w-3" /> No Suggestions
              </span>
            {:else}
              <span class="bg-ember-light text-ember inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <AlertCircle class="h-3 w-3" /> Failed
              </span>
            {/if}
            <p class="text-muted line-clamp-2 text-xs">{result.errorMessage}</p>
          </div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm check`
Expected: No type errors related to AiResultCard

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/components/ai/AiResultCard.svelte
git commit -m "feat(ui): show inline error message in AiResultCard instead of tooltip"
```

---

### Task 3: AiResultDetailDrawer — Error Banner and Retry Footer

**Files:**
- Modify: `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`

This task adds two things:
1. A red error banner between the header and suggestions when `appliedStatus === 'failed'`
2. A retry button in the sticky footer for failed results

- [ ] **Step 1: Add `RefreshCw` and `Loader2` to imports if not already present**

In `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`, line 1 — check existing imports. `RefreshCw` and `Loader2` are already imported (line 7-8). `AlertCircle` is also already imported (line 8). No import changes needed.

- [ ] **Step 2: Add retry state variable**

In `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`, after line 55 (`let isRejecting = $state(false);`), add:

```typescript
  let isRetrying = $state(false);
```

- [ ] **Step 3: Add handleRetry function**

In `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`, after the `handleReject` function (after line 166), add:

```typescript
  async function handleRetry(): Promise<void> {
    if (!activeId) return;
    isRetrying = true;
    try {
      await onapply(activeId, ['title', 'correspondent', 'documentType', 'tags'], {
        allowClearing: false,
        createMissingEntities: true,
      });
    } finally {
      isRetrying = false;
    }
  }
```

- [ ] **Step 4: Add error banner between header and suggestions**

In `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`, after the header closing `</div>` (line 279) and before the `<!-- Suggestions -->` comment (line 281), add:

```svelte
      <!-- Error Banner -->
      {#if detail.appliedStatus === 'failed' && detail.errorMessage}
        <div class="bg-ember-light/30 border-ember/20 space-y-2 rounded-lg border p-4">
          <div class="flex items-start gap-2">
            <AlertCircle class="text-ember mt-0.5 h-4 w-4 shrink-0" />
            <div class="min-w-0 space-y-1">
              <p class="text-ember text-sm font-semibold">Apply Failed</p>
              {#if detail.failureType}
                <span class="bg-ember-light text-ember rounded-full px-2 py-0.5 text-xs font-medium">
                  {detail.failureType}
                </span>
              {/if}
            </div>
          </div>
          <pre class="text-ink bg-canvas whitespace-pre-wrap rounded p-3 text-xs">{detail.errorMessage}</pre>
        </div>
      {/if}
```

- [ ] **Step 5: Add retry footer for failed results**

In `packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte`, after the existing action footer block (after line 424, the closing `{/if}` for `pending_review`), add:

```svelte
    {#if detail.appliedStatus === 'failed'}
      <div class="border-soft bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
        <button
          onclick={handleRetry}
          disabled={isRetrying}
          class="bg-accent hover:bg-accent-hover flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
        >
          {#if isRetrying}
            <Loader2 class="h-4 w-4 animate-spin" />
            Retrying...
          {:else}
            <RefreshCw class="h-4 w-4" />
            Retry Apply
          {/if}
        </button>
      </div>
    {/if}
```

- [ ] **Step 6: Verify the build compiles**

Run: `pnpm check`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/components/ai/AiResultDetailDrawer.svelte
git commit -m "feat(ui): add error banner and retry button to AiResultDetailDrawer"
```

---

### Task 4: Queue Page — Error Message Wrapping

**Files:**
- Modify: `packages/web/src/routes/ai-processing/queue/+page.svelte:442-458`

- [ ] **Step 1: Change error message layout from inline to stacked, remove truncation**

In `packages/web/src/routes/ai-processing/queue/+page.svelte`, replace lines 442-458:

```svelte
              <div class="flex flex-wrap items-center gap-2">
                {#if result.failureType === 'no_suggestions'}
                  <span class="bg-warn-light text-warn rounded-full px-2 py-0.5 text-xs font-medium"
                    >No Suggestions</span
                  >
                  <span class="text-muted truncate text-xs"
                    >AI could not suggest metadata for this document</span
                  >
                {:else}
                  <span
                    class="bg-ember-light text-ember rounded-full px-2 py-0.5 text-xs font-medium"
                    >Failed</span
                  >
                  {#if result.errorMessage}
                    <span class="text-muted truncate text-xs">{result.errorMessage}</span>
                  {/if}
                {/if}
              </div>
```

with:

```svelte
              <div class="space-y-1">
                {#if result.failureType === 'no_suggestions'}
                  <span class="bg-warn-light text-warn rounded-full px-2 py-0.5 text-xs font-medium"
                    >No Suggestions</span
                  >
                  <p class="text-muted text-xs"
                    >AI could not suggest metadata for this document</p
                  >
                {:else}
                  <span
                    class="bg-ember-light text-ember rounded-full px-2 py-0.5 text-xs font-medium"
                    >Failed</span
                  >
                  {#if result.errorMessage}
                    <p class="text-muted line-clamp-3 text-xs">{result.errorMessage}</p>
                  {/if}
                {/if}
              </div>
```

Key changes: `flex flex-wrap items-center gap-2` → `space-y-1` (stacked layout), `truncate` → `line-clamp-3` on error message, `<span>` → `<p>` so the text is a block element that wraps.

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/ai-processing/queue/+page.svelte
git commit -m "feat(ui): allow error messages to wrap in queue page failed section"
```

---

### Task 5: History Page — Error Banner and Retry in Inline Drawer

**Files:**
- Modify: `packages/web/src/routes/ai-processing/history/+page.svelte`

The history page has its own inline detail drawer (NOT the shared `AiResultDetailDrawer` component). It needs the same error banner and retry treatment.

- [ ] **Step 1: Add Loader2 and RefreshCw to imports**

In `packages/web/src/routes/ai-processing/history/+page.svelte`, line 8, change:

```typescript
  import {
    Search,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    Undo2,
    AlertCircle,
    ExternalLink,
    Loader2,
    X,
    History,
  } from 'lucide-svelte';
```

`Loader2` is already imported (line 17). Add `RefreshCw`:

```typescript
  import {
    Search,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    Undo2,
    AlertCircle,
    ExternalLink,
    Loader2,
    RefreshCw,
    X,
    History,
  } from 'lucide-svelte';
```

- [ ] **Step 2: Add retry state and handler**

In `packages/web/src/routes/ai-processing/history/+page.svelte`, after the `isReverting` state declaration (line 33), add:

```typescript
  let isRetryingApply = $state(false);
```

After the `handleRevert` function (after line 148), add:

```typescript
  async function handleRetryApply(id: string) {
    isRetryingApply = true;
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: ['title', 'correspondent', 'documentType', 'tags'],
          allowClearing: false,
          createMissingEntities: true,
        }),
      });
      if (res.ok) {
        addToast('success', 'Apply retried successfully');
        closeDetail();
        invalidateAll();
      } else {
        const json = await res.json();
        addToast('error', json.error?.message ?? 'Retry failed');
      }
    } catch {
      addToast('error', 'Retry failed');
    } finally {
      isRetryingApply = false;
    }
  }
```

- [ ] **Step 3: Add error banner in the inline drawer**

In `packages/web/src/routes/ai-processing/history/+page.svelte`, after the header closing `</div>` (line 387, the end of the header section including the "View in Paperless" link) and before `<!-- Suggestions Summary -->` (line 389), add:

```svelte
            <!-- Error Banner -->
            {#if activeResultDetail.appliedStatus === 'failed' && activeResultDetail.errorMessage}
              <div class="bg-ember-light/30 border-ember/20 space-y-2 rounded-lg border p-4">
                <div class="flex items-start gap-2">
                  <AlertCircle class="text-ember mt-0.5 h-4 w-4 shrink-0" />
                  <div class="min-w-0 space-y-1">
                    <p class="text-ember text-sm font-semibold">Apply Failed</p>
                    {#if activeResultDetail.failureType}
                      <span class="bg-ember-light text-ember rounded-full px-2 py-0.5 text-xs font-medium">
                        {activeResultDetail.failureType}
                      </span>
                    {/if}
                  </div>
                </div>
                <pre class="text-ink bg-canvas whitespace-pre-wrap rounded p-3 text-xs">{activeResultDetail.errorMessage}</pre>
              </div>
            {/if}
```

- [ ] **Step 4: Add error message in history table rows for failed results**

In `packages/web/src/routes/ai-processing/history/+page.svelte`, after the status badge `</span>` in the table row (line 259), add a conditional error message display. Replace the status `<td>` (lines 253-261):

```svelte
                  <td class="hidden p-3 sm:table-cell">
                    <span
                      class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
                        result.appliedStatus,
                      )}"
                    >
                      {statusDisplayText(result.appliedStatus)}
                    </span>
                  </td>
```

with:

```svelte
                  <td class="hidden p-3 sm:table-cell">
                    <div class="space-y-1">
                      <span
                        class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
                          result.appliedStatus,
                        )}"
                      >
                        {statusDisplayText(result.appliedStatus)}
                      </span>
                      {#if result.appliedStatus === 'failed' && result.errorMessage}
                        <p class="text-muted line-clamp-2 text-xs">{result.errorMessage}</p>
                      {/if}
                    </div>
                  </td>
```

- [ ] **Step 5: Add retry footer for failed results in the inline drawer**

In `packages/web/src/routes/ai-processing/history/+page.svelte`, after the existing revert footer block (after line 456, the closing `{/if}` for the revert button), add:

```svelte
          {#if activeResultDetail.appliedStatus === 'failed'}
            <div class="border-soft bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
              <button
                onclick={() => activeResultDetail && handleRetryApply(activeResultDetail.id)}
                disabled={isRetryingApply}
                class="bg-accent hover:bg-accent-hover flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
              >
                {#if isRetryingApply}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Retrying...
                {:else}
                  <RefreshCw class="h-4 w-4" />
                  Retry Apply
                {/if}
              </button>
            </div>
          {/if}
```

- [ ] **Step 6: Verify the build compiles**

Run: `pnpm check`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/routes/ai-processing/history/+page.svelte
git commit -m "feat(ui): add error banner and retry to history page drawer"
```

---

### Task 6: Final Build Verification

- [ ] **Step 1: Run full build and lint**

Run: `pnpm lint && pnpm check && pnpm build`
Expected: All pass with zero errors

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All unit tests pass (no core changes were made, so these should be unaffected)

- [ ] **Step 3: Final commit if any lint fixes were needed**

If lint auto-fix changed anything:
```bash
pnpm lint:fix && pnpm format:fix
git add -u
git commit -m "style: lint and format fixes"
```
