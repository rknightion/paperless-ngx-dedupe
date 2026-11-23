<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { browser } from '$app/env';
  import { Button, Checkbox, ProgressBar, Select, TextField } from '$lib/components';
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
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
  import type { AiFailureCategory } from '@paperless-dedupe/core';

  let { data } = $props();

  const PAGE_SIZE_OPTIONS = [
    { value: '20', label: '20 / page' },
    { value: '50', label: '50 / page' },
    { value: '100', label: '100 / page' },
  ];
  const FILTER_PAGE_SIZE_OPTIONS = [
    { value: '20', label: '20' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
  ];
  const FAILURE_CATEGORY_OPTIONS = [
    { value: '', label: 'All categories' },
    { value: 'temporary', label: 'Temporary service issue' },
    { value: 'no_content', label: 'No OCR content' },
    { value: 'extraction', label: 'Extraction could not be completed' },
    { value: 'configuration', label: 'Configuration needs attention' },
  ];
  const readOnly = $derived(data.readOnly === true);

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
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
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
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('cursor', cursor);
    goto(`/ai-processing/review?${params.toString()}`);
  }

  function changePageSize(value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('limit', value);
    params.delete('cursor');
    goto(`/ai-processing/review?${params.toString()}`);
  }

  async function handleRevert(id: string, selection: AiFieldSelection) {
    if (readOnly) return;
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
      : 'text-muted border-transparent'}"
  >
    Review suggestions
  </a>
  <a
    href="/ai-processing/review?queue=failures&limit={data.limit}"
    aria-current={data.queue === 'failures' ? 'page' : undefined}
    class="border-b-2 px-4 py-2 text-sm font-medium {data.queue === 'failures'
      ? 'border-accent text-accent'
      : 'text-muted border-transparent'}"
  >
    Extraction failures
  </a>
  <a
    href="/ai-processing/review?queue=history&limit={data.limit}"
    aria-current={data.queue === 'history' ? 'page' : undefined}
    class="border-b-2 px-4 py-2 text-sm font-medium {data.queue === 'history'
      ? 'border-accent text-accent'
      : 'text-muted border-transparent'}"
  >
    Apply audit
  </a>
</nav>

{#if data.returnTo}
  <a href={data.returnTo} class="text-accent mb-4 inline-flex text-sm font-medium">
    Return to documents
  </a>
{/if}

<form method="GET" class="panel mb-4 flex flex-wrap items-end gap-3">
  <!-- Hidden inputs carry GET state through the filter form; they have no visible control. -->
  <input type="hidden" name="queue" value={data.queue} />
  {#if data.documentId}
    <input type="hidden" name="documentId" value={data.documentId} />
  {/if}
  {#if data.returnTo}
    <input type="hidden" name="returnTo" value={data.returnTo} />
  {/if}
  <TextField
    bind:ref={searchInputRef}
    label="Search documents"
    name="search"
    value={data.search ?? ''}
  />
  <Select
    name="limit"
    label="Page size"
    value={String(data.limit)}
    options={FILTER_PAGE_SIZE_OPTIONS}
  />
  {#if data.queue === 'review'}
    <Checkbox
      name="changedOnly"
      value="true"
      label="Changed fields only"
      checked={data.changedOnly === true}
      class="pb-2"
    />
  {/if}
  {#if data.queue === 'failures'}
    <Select
      name="failureCategory"
      label="Failure category"
      value={data.failureCategory ?? ''}
      options={FAILURE_CATEGORY_OPTIONS}
    />
  {/if}
  <Button type="submit">Apply filters</Button>
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
        <Checkbox bind:checked={batchSelection.title} label="Title" />
      {/if}
      {#if data.extractEnabled.correspondent}
        <Checkbox bind:checked={batchSelection.correspondent} label="Correspondent" />
      {/if}
      {#if data.extractEnabled.documentType}
        <Checkbox bind:checked={batchSelection.documentType} label="Document type" />
      {/if}
      {#if data.extractEnabled.tags}
        <Checkbox bind:checked={batchSelection.tags} label="Tags" />
      {/if}
      {#if data.extractEnabled.processedTag}
        <Checkbox bind:checked={batchSelection.processedTag} label="Processed tag" />
      {/if}
      {#if data.extractEnabled.customFields}
        <TextField
          label="Custom field IDs (comma-separated)"
          bind:value={batchCustomFieldIds}
          inputmode="numeric"
        />
      {/if}
    </fieldset>
  {/if}
{/if}

<!-- Apply Progress Panel -->
{#if isApplying}
  <div class="panel">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5 text-sm font-medium">
        <CircleNotchIcon class="text-accent h-4 w-4 animate-spin" />
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
          <Select
            ariaLabel="Results per page"
            value={String(data.limit)}
            options={PAGE_SIZE_OPTIONS}
            onchange={changePageSize}
          />
        </div>
        {#if data.previousCursor || data.nextCursor}
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              icon={CaretLeftIcon}
              ariaLabel="Previous AI results"
              onclick={() => goToCursor(data.previousCursor)}
              disabled={!data.previousCursor}
            />
            <Button
              variant="outline"
              size="sm"
              icon={CaretRightIcon}
              ariaLabel="Next AI results"
              onclick={() => goToCursor(data.nextCursor)}
              disabled={!data.nextCursor}
            />
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
