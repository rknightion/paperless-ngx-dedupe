<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { ProgressBar } from '$lib/components';
  import AiResultList from '$lib/components/ai/AiResultList.svelte';
  import AiBulkActionBar from '$lib/components/ai/AiBulkActionBar.svelte';
  import AiResultDetailDrawer from '$lib/components/ai/AiResultDetailDrawer.svelte';
  import AiKeyboardHandler from '$lib/components/ai/AiKeyboardHandler.svelte';
  import AiPreflightDialog from '$lib/components/ai/AiPreflightDialog.svelte';
  import AiFailureQueue from '$lib/components/ai/AiFailureQueue.svelte';
  import { trackAiResultAction, trackAiBulkAction } from '$lib/faro-events';
  import {
    selectedIds,
    getActiveResultId,
    closeDetail,
    addToast,
    createDefaultFieldSelection,
    selectResult,
    removeSelection,
  } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import type {
    AiResultSummary,
    ApplyPreflightResult,
    AiFieldSelection,
    AiMutationPlanPreview,
  } from '@paperless-dedupe/core';
  import { Loader2, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { AiFailureCategory } from '@paperless-dedupe/core';

  let { data } = $props();

  // ── Bulk Apply State ──
  let showPreflight = $state(false);
  let preflightData = $state<ApplyPreflightResult | null>(null);
  let preflightLoading = $state(false);
  let _applyJobId = $state<string | null>(null);
  let applyProgress = $state(0);
  let applyMessage = $state('');
  let isApplying = $state(false);
  let applySseConnection: ReturnType<typeof connectJobSSE> | null = null;
  let pendingApplyToken = $state<string | null>(null);
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let batchCustomFieldIds = $state('');
  let batchSelection = $state<AiFieldSelection>({
    title: false,
    correspondent: false,
    documentType: false,
    tags: false,
    processedTag: false,
    customFieldIds: [],
  });

  // ── Mobile Detection ──
  let isMobile = $state(false);
  if (browser) {
    const mq = window.matchMedia('(max-width: 1023px)');
    isMobile = mq.matches;
    mq.addEventListener('change', (e) => {
      isMobile = e.matches;
    });
  }

  // ── Derived ──
  const results = $derived(data.results);
  const activeResultId = $derived(getActiveResultId());

  // Cleanup on unmount
  $effect(() => {
    return () => {
      applySseConnection?.close();
    };
  });

  // ── Action Handlers ──

  async function handleApply(
    id: string,
    selection: AiFieldSelection,
    options: { allowClearing: boolean; createMissingEntities: boolean },
  ) {
    const fieldsApplied = [
      selection.title && 'title',
      selection.correspondent && 'correspondent',
      selection.documentType && 'documentType',
      selection.tags && 'tags',
      selection.processedTag && 'processedTag',
      ...selection.customFieldIds.map((fieldId) => `customField:${fieldId}`),
    ].filter((field): field is string => Boolean(field));
    trackAiResultAction('apply', { resultId: id, fieldsApplied });
    await runPreflight({ type: 'selected_result_ids', resultIds: [id] }, selection, options);
  }

  async function handleReprocess(id: string) {
    trackAiResultAction('reprocess', { resultId: id });
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/reprocess?mode=inbox`, { method: 'POST' });
      if (res.ok) {
        addToast('success', 'Extraction retried successfully');
        invalidateAll();
      } else {
        const json = await res.json();
        addToast('error', json.error?.message ?? 'Retry extraction failed');
      }
    } catch {
      addToast('error', 'Retry extraction failed');
    }
  }

  async function handleRetryGroup(_category: AiFailureCategory, resultIds: string[]) {
    for (const id of resultIds) {
      await handleReprocess(id);
    }
  }

  async function handleReject(id: string) {
    trackAiResultAction('reject', { resultId: id });
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/reject`, {
        method: 'POST',
      });
      if (res.ok) {
        addToast('success', 'Result rejected');
        removeSelection(id);
        invalidateAll();
      } else {
        addToast('error', 'Failed to reject result');
      }
    } catch {
      addToast('error', 'Failed to reject result');
    }
  }

  async function handleApplySimple(id: string) {
    const result = results.find((r: AiResultSummary) => r.id === id);
    if (!result) return;
    const selection = createDefaultFieldSelection(result, data.extractEnabled);
    await handleApply(id, selection, { allowClearing: false, createMissingEntities: true });
  }

  async function runPreflight(
    scope: Record<string, unknown>,
    selection: AiFieldSelection,
    options = { allowClearing: false, createMissingEntities: true },
  ) {
    preflightLoading = true;
    preflightData = null;
    showPreflight = true;
    try {
      const res = await fetch('/api/v1/ai/results/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, selection, ...options }),
      });
      const json = await res.json();
      if (res.ok) {
        const preview = json.data as AiMutationPlanPreview;
        preflightData = preview.preflight;
        pendingApplyToken = preview.token;
      } else {
        showPreflight = false;
        addToast('error', json.error?.message ?? 'Failed to compute preflight');
      }
    } catch {
      showPreflight = false;
      addToast('error', 'Failed to compute preflight');
    } finally {
      preflightLoading = false;
    }
  }

  function connectApplySSE(id: string) {
    applySseConnection?.close();
    isApplying = true;
    _applyJobId = id;
    applyProgress = 0;
    applyMessage = 'Applying changes...';
    applySseConnection = connectJobSSE(id, {
      onProgress: (d) => {
        applyProgress = d.progress;
        applyMessage = d.message ?? 'Applying...';
      },
      onComplete: (d) => {
        isApplying = false;
        _applyJobId = null;
        applySseConnection = null;
        const sseData = d as { status?: string; applied?: number; failed?: number };
        if (sseData.status === 'failed') {
          addToast('error', 'Bulk apply failed');
        } else {
          const applied = sseData.applied ?? 0;
          const failedCount = sseData.failed ?? 0;
          if (failedCount > 0) {
            addToast('warning', `Bulk apply: ${applied} succeeded, ${failedCount} failed`);
          } else {
            addToast('success', `Applied ${applied} results`);
          }
        }
        selectedIds.clear();
        invalidateAll();
      },
      onError: () => {
        isApplying = false;
        _applyJobId = null;
        applySseConnection = null;
        addToast('error', 'Lost connection during bulk apply');
        invalidateAll();
      },
    });
  }

  async function executeApply(planToken: string) {
    showPreflight = false;
    try {
      const res = await fetch('/api/v1/ai/results/batch-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planToken }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        connectApplySSE(json.data.jobId);
      } else if (res.ok) {
        const { applied, failed } = json.data;
        if (failed > 0) {
          addToast('warning', `Batch apply: ${applied} succeeded, ${failed} failed`);
        } else {
          addToast('success', `Applied ${applied} results`);
        }
        selectedIds.clear();
        invalidateAll();
      } else {
        addToast('error', json.error?.message ?? 'Batch apply failed');
      }
    } catch {
      addToast('error', 'Batch apply failed');
    }
  }

  function handlePreflightConfirm() {
    if (pendingApplyToken) {
      executeApply(pendingApplyToken);
    }
  }

  function handlePreflightCancel() {
    showPreflight = false;
    preflightData = null;
    pendingApplyToken = null;
  }

  async function handleBatchApply() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const customFieldIds = [
      ...new Set(
        batchCustomFieldIds
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ].sort((a, b) => a - b);
    const selection = { ...batchSelection, customFieldIds };
    if (
      !selection.title &&
      !selection.correspondent &&
      !selection.documentType &&
      !selection.tags &&
      !selection.processedTag &&
      selection.customFieldIds.length === 0
    ) {
      addToast('warning', 'Choose at least one field to apply');
      return;
    }
    trackAiBulkAction({
      action: 'apply',
      scope: 'selected',
      count: ids.length,
    });
    await runPreflight({ type: 'selected_result_ids', resultIds: ids }, selection);
  }

  async function handleBatchReject() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    trackAiBulkAction({ action: 'reject', scope: 'selected', count: ids.length });
    try {
      const res = await fetch('/api/v1/ai/results/batch-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultIds: ids }),
      });
      if (res.ok) {
        addToast('success', `Rejected ${ids.length} results`);
        selectedIds.clear();
        invalidateAll();
      } else {
        addToast('error', 'Batch reject failed');
      }
    } catch {
      addToast('error', 'Batch reject failed');
    }
  }

  function goToCursor(cursor: string | null) {
    if (!cursor) return;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('cursor', cursor);
    goto(`/ai-processing/review?${params.toString()}`);
  }

  function changePageSize(e: Event) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('limit', (e.target as HTMLSelectElement).value);
    params.delete('cursor');
    goto(`/ai-processing/review?${params.toString()}`);
  }

  async function handleRevert(id: string, selection: AiFieldSelection) {
    try {
      const previewResponse = await fetch(`/api/v1/ai/results/${id}/revert/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection }),
      });
      const preview = await previewResponse.json();
      if (!previewResponse.ok) {
        addToast('error', 'The selected fields can no longer be safely reverted');
        return;
      }
      const response = await fetch(`/api/v1/ai/results/${id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planToken: preview.data.token }),
      });
      const body = await response.json();
      if (response.ok && body.data?.jobId) {
        connectApplySSE(body.data.jobId);
      } else {
        addToast('error', 'Failed to queue the reviewed revert');
      }
    } catch {
      addToast('error', 'Failed to queue the reviewed revert');
    }
  }
</script>

<nav class="border-soft mb-4 flex gap-1 border-b" aria-label="AI review queues">
  <a
    href="/ai-processing/review?queue=review&limit={data.limit}"
    aria-current={data.queue === 'review' ? 'page' : undefined}
    class="border-b-2 px-4 py-2 text-sm font-medium {data.queue === 'review'
      ? 'border-accent text-accent'
      : 'text-muted border-transparent'}">Review suggestions</a
  >
  <a
    href="/ai-processing/review?queue=failures&limit={data.limit}"
    aria-current={data.queue === 'failures' ? 'page' : undefined}
    class="border-b-2 px-4 py-2 text-sm font-medium {data.queue === 'failures'
      ? 'border-accent text-accent'
      : 'text-muted border-transparent'}">Extraction failures</a
  >
  <a
    href="/ai-processing/review?queue=history&limit={data.limit}"
    aria-current={data.queue === 'history' ? 'page' : undefined}
    class="border-b-2 px-4 py-2 text-sm font-medium {data.queue === 'history'
      ? 'border-accent text-accent'
      : 'text-muted border-transparent'}">Apply audit</a
  >
</nav>

{#if data.returnTo}
  <a href={data.returnTo} class="text-accent mb-4 inline-flex text-sm font-medium">
    Return to documents
  </a>
{/if}

<form method="GET" class="panel mb-4 flex flex-wrap items-end gap-3">
  <input type="hidden" name="queue" value={data.queue} />
  {#if data.documentId}
    <input type="hidden" name="documentId" value={data.documentId} />
  {/if}
  {#if data.returnTo}
    <input type="hidden" name="returnTo" value={data.returnTo} />
  {/if}
  <label class="grid gap-1 text-sm">
    <span class="text-muted text-xs font-medium">Search documents</span>
    <input
      bind:this={searchInputRef}
      name="search"
      value={data.search ?? ''}
      class="border-soft bg-surface text-ink rounded-lg border px-3 py-2"
    />
  </label>
  <label class="grid gap-1 text-sm">
    <span class="text-muted text-xs font-medium">Page size</span>
    <select
      name="limit"
      value={data.limit}
      class="border-soft bg-surface text-ink rounded-lg border px-3 py-2"
    >
      <option value="20">20</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  </label>
  {#if data.queue === 'review'}
    <label class="flex items-center gap-2 pb-2 text-sm">
      <input type="checkbox" name="changedOnly" value="true" checked={data.changedOnly} />
      Changed fields only
    </label>
  {/if}
  {#if data.queue === 'failures'}
    <label class="grid gap-1 text-sm">
      <span class="text-muted text-xs font-medium">Failure category</span>
      <select
        name="failureCategory"
        value={data.failureCategory ?? ''}
        class="border-soft bg-surface text-ink rounded-lg border px-3 py-2"
      >
        <option value="">All categories</option>
        <option value="temporary">Temporary service issue</option>
        <option value="no_content">No OCR content</option>
        <option value="extraction">Extraction could not be completed</option>
        <option value="configuration">Configuration needs attention</option>
      </select>
    </label>
  {/if}
  <button
    class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
  >
    Apply filters
  </button>
</form>

<!-- Bulk Action Bar -->
{#if data.queue === 'review'}
  <AiBulkActionBar
    selectedCount={selectedIds.size}
    onbatchapply={handleBatchApply}
    onbatchreject={handleBatchReject}
  />
  {#if selectedIds.size > 0}
    <fieldset class="panel mt-3 flex flex-wrap items-end gap-4">
      <legend class="text-ink px-1 text-sm font-semibold">Fields for selected documents</legend>
      {#if data.extractEnabled.title}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={batchSelection.title} />
          Title
        </label>
      {/if}
      {#if data.extractEnabled.correspondent}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={batchSelection.correspondent} />
          Correspondent
        </label>
      {/if}
      {#if data.extractEnabled.documentType}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={batchSelection.documentType} />
          Document type
        </label>
      {/if}
      {#if data.extractEnabled.tags}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={batchSelection.tags} />
          Tags
        </label>
      {/if}
      {#if data.extractEnabled.processedTag}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={batchSelection.processedTag} />
          Processed tag
        </label>
      {/if}
      {#if data.extractEnabled.customFields}
        <label class="grid gap-1 text-sm">
          <span class="text-muted text-xs">Custom field IDs (comma-separated)</span>
          <input
            bind:value={batchCustomFieldIds}
            inputmode="numeric"
            class="border-soft bg-surface text-ink rounded-lg border px-3 py-2"
          />
        </label>
      {/if}
    </fieldset>
  {/if}
{/if}

<!-- Apply Progress Panel -->
{#if isApplying}
  <div class="panel">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5 text-sm font-medium">
        <Loader2 class="text-accent h-4 w-4 animate-spin" />
        <span class="text-ink">Applying changes...</span>
      </div>
    </div>
    <div class="mt-3">
      <ProgressBar progress={applyProgress} message={applyMessage} />
    </div>
  </div>
{/if}

<!-- Master-Detail Layout -->
<div class="flex gap-4">
  <!-- List Pane -->
  <div class="min-w-0 flex-1">
    {#if data.queue === 'failures'}
      <AiFailureQueue
        {results}
        groups={data.failureGroups}
        onretrygroup={handleRetryGroup}
        onopen={(id) => selectResult(id)}
      />
    {:else}
      <AiResultList
        {results}
        viewMode={isMobile ? 'cards' : 'table'}
        onapply={handleApplySimple}
        onreject={handleReject}
      />
    {/if}

    <!-- Pagination -->
    {#if data.total > 0}
      <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <p class="text-muted text-sm">
            Showing <span class="text-ink font-medium">{results.length}</span>
            of <span class="text-ink font-medium">{data.total}</span>
          </p>
          <select
            aria-label="Results per page"
            value={data.limit}
            onchange={changePageSize}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-2 py-1 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
        </div>
        {#if data.previousCursor || data.nextCursor}
          <div class="flex items-center gap-1">
            <button
              onclick={() => goToCursor(data.previousCursor)}
              disabled={!data.previousCursor}
              aria-label="Previous AI results"
              class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 transition-colors disabled:opacity-30"
            >
              <ChevronLeft class="h-4 w-4" />
            </button>
            <button
              onclick={() => goToCursor(data.nextCursor)}
              disabled={!data.nextCursor}
              aria-label="Next AI results"
              class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 transition-colors disabled:opacity-30"
            >
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Desktop Detail Drawer -->
  {#if activeResultId && !isMobile}
    <AiResultDetailDrawer
      resultId={activeResultId}
      paperlessUrl={data.paperlessUrl}
      extractEnabled={data.extractEnabled}
      onapply={handleApply}
      onreject={handleReject}
      onreprocess={handleReprocess}
      onrevert={handleRevert}
      onclose={closeDetail}
    />
  {/if}
</div>

<!-- Mobile Detail Drawer -->
{#if activeResultId && isMobile}
  <AiResultDetailDrawer
    resultId={activeResultId}
    mobile
    paperlessUrl={data.paperlessUrl}
    extractEnabled={data.extractEnabled}
    onapply={handleApply}
    onreject={handleReject}
    onreprocess={handleReprocess}
    onrevert={handleRevert}
    onclose={closeDetail}
  />
{/if}

<!-- Overlays -->
<AiKeyboardHandler
  {results}
  onapply={(id, selection) =>
    handleApply(id, selection, { allowClearing: false, createMissingEntities: true })}
  onreject={handleReject}
  {searchInputRef}
/>
<AiPreflightDialog
  open={showPreflight}
  preflight={preflightData}
  loading={preflightLoading}
  onconfirm={handlePreflightConfirm}
  oncancel={handlePreflightCancel}
/>
