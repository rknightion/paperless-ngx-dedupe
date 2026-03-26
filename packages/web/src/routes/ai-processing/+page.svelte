<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { ProgressBar, ConfirmDialog } from '$lib/components';
  import AiResultList from '$lib/components/ai/AiResultList.svelte';
  import AiFilterBar from '$lib/components/ai/AiFilterBar.svelte';
  import AiBulkActionBar from '$lib/components/ai/AiBulkActionBar.svelte';
  import AiResultDetailDrawer from '$lib/components/ai/AiResultDetailDrawer.svelte';
  import AiToastContainer from '$lib/components/ai/AiToastContainer.svelte';
  import AiKeyboardHandler from '$lib/components/ai/AiKeyboardHandler.svelte';
  import AiDocumentPickerModal from '$lib/components/ai/AiDocumentPickerModal.svelte';
  import AiPreflightDialog from '$lib/components/ai/AiPreflightDialog.svelte';
  import AiResultGroupedList from '$lib/components/ai/AiResultGroupedList.svelte';
  import {
    selectedIds,
    getActiveResultId,
    closeDetail,
    pruneSelection,
    addToast,
    resetStore,
    selectAllMatchingFilter,
    clearFilterSelection,
    getSelectionMode,
  } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import type { AiResultSummary, ApplyPreflightResult } from '@paperless-dedupe/core';
  import {
    Brain,
    Play,
    Pause,
    RefreshCw,
    Loader2,
    FileText,
    AlertCircle,
    CircleDot,
    CircleCheck,
    CircleX,
    TriangleAlert,
    X,
    Info,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
  } from 'lucide-svelte';

  let { data } = $props();

  const initialData = untrack(() => data);

  // ── SSE State ──
  let isProcessing = $state(false);
  let jobId = $state<string | null>(initialData.activeJob?.id ?? null);
  let jobProgress = $state(initialData.activeJob?.progress ?? 0);
  let jobPhaseProgress = $state<number | undefined>(undefined);
  let jobMessage = $state(initialData.activeJob?.progressMessage ?? '');
  let jobError = $state<string | null>(null);
  let sseConnection: { close: () => void } | null = null;
  let showResumeHint = $state(false);
  let lastInvalidateTime = 0;
  const INVALIDATE_INTERVAL_MS = 3000;

  // ── Bulk Apply State ──
  let showDocPicker = $state(false);
  let showPreflight = $state(false);
  let preflightData = $state<ApplyPreflightResult | null>(null);
  let preflightLoading = $state(false);
  let _applyJobId = $state<string | null>(null);
  let applyProgress = $state(0);
  let applyMessage = $state('');
  let isApplying = $state(false);
  let applySseConnection: ReturnType<typeof connectJobSSE> | null = null;
  let pendingApplyScope = $state<Record<string, unknown> | null>(null);

  // ── Process Scope Dropdown ──
  let showProcessMenu = $state(false);
  let confirmReprocessAll = $state(false);

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
  const stats = $derived(data.stats);
  const activeResultId = $derived(getActiveResultId());
  const isResumable = $derived(stats.unprocessed > 0 && stats.totalProcessed > 0);
  const totalPages = $derived(Math.ceil(data.total / data.limit));
  const currentPage = $derived(Math.floor(data.offset / data.limit) + 1);
  const selectionMode = $derived(getSelectionMode());
  const hasActiveFilters = $derived(
    !!(
      data.status ||
      data.search ||
      data.changedOnly ||
      data.failed ||
      data.minConfidence ||
      data.provider ||
      data.model
    ),
  );

  // ── Selection Preservation ──
  $effect(() => {
    const currentIds = new Set(results.map((r: AiResultSummary) => r.id));
    pruneSelection(currentIds);
  });

  // ── SSE Connection ──
  function connectSSE(id: string) {
    sseConnection?.close();
    isProcessing = true;
    jobError = null;
    sseConnection = connectJobSSE(id, {
      onProgress: (d) => {
        jobProgress = d.progress;
        jobPhaseProgress = d.phaseProgress;
        jobMessage = d.message ?? '';

        const now = Date.now();
        if (now - lastInvalidateTime > INVALIDATE_INTERVAL_MS) {
          lastInvalidateTime = now;
          invalidateAll();
        }
      },
      onComplete: (d) => {
        isProcessing = false;
        jobId = null;
        jobPhaseProgress = undefined;
        sseConnection = null;

        const sseData = d as { status?: string; errorMessage?: string };
        if (sseData.status === 'failed') {
          jobProgress = 0;
          jobError = sseData.errorMessage ?? 'Processing failed';
          jobMessage = '';
        } else if (sseData.status === 'cancelled') {
          jobMessage = 'Processing paused';
          showResumeHint = true;
        } else {
          jobProgress = 1;
          jobMessage = 'Processing complete';
        }

        invalidateAll();
      },
      onError: () => {
        isProcessing = false;
        jobId = null;
        sseConnection = null;
        invalidateAll();
      },
    });
  }

  $effect(() => {
    if (jobId) connectSSE(jobId);
    return () => {
      sseConnection?.close();
    };
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      sseConnection?.close();
      applySseConnection?.close();
      resetStore();
    };
  });

  // ── Action Handlers ──

  async function startProcessing(reprocess = false) {
    isProcessing = true;
    jobProgress = 0;
    jobError = null;
    jobMessage = 'Starting...';
    showResumeHint = false;
    try {
      const res = await fetch('/api/v1/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        jobId = json.data.jobId;
        addToast('success', reprocess ? 'Re-processing started' : 'Processing started');
      } else {
        isProcessing = false;
        jobMessage = '';
        addToast('error', json.error?.message ?? 'Failed to start processing');
      }
    } catch {
      isProcessing = false;
      jobMessage = '';
      addToast('error', 'Failed to start processing');
    }
  }

  async function startProcessingWithScope(scope: Record<string, unknown>, label: string) {
    isProcessing = true;
    jobProgress = 0;
    jobError = null;
    jobMessage = 'Starting...';
    showResumeHint = false;
    showProcessMenu = false;
    try {
      const res = await fetch('/api/v1/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        jobId = json.data.jobId;
        addToast('success', label);
      } else {
        isProcessing = false;
        jobMessage = '';
        addToast('error', json.error?.message ?? 'Failed to start processing');
      }
    } catch {
      isProcessing = false;
      jobMessage = '';
      addToast('error', 'Failed to start processing');
    }
  }

  function handleProcessNew() {
    showProcessMenu = false;
    startProcessing(false);
  }

  function handleRetryFailed() {
    showProcessMenu = false;
    startProcessingWithScope({ type: 'failed_only' }, 'Retrying failed documents');
  }

  function handleProcessSelected(documentIds: string[]) {
    showDocPicker = false;
    if (documentIds.length === 0) return;
    startProcessingWithScope(
      { type: 'selected_document_ids', documentIds },
      `Processing ${documentIds.length} selected document${documentIds.length === 1 ? '' : 's'}`,
    );
  }

  function handleRerunCurrentFilter() {
    showProcessMenu = false;
    const currentFilters: Record<string, string> = {};
    if (data.status) currentFilters.status = data.status;
    if (data.search) currentFilters.search = data.search;
    if (data.changedOnly) currentFilters.changedOnly = 'true';
    if (data.failed) currentFilters.failed = 'true';
    if (data.minConfidence) currentFilters.minConfidence = String(data.minConfidence);
    if (data.provider) currentFilters.provider = data.provider;
    if (data.model) currentFilters.model = data.model;
    startProcessingWithScope(
      { type: 'current_filter', filters: currentFilters },
      'Re-running on current filter',
    );
  }

  function handleReprocessAll() {
    confirmReprocessAll = false;
    showProcessMenu = false;
    startProcessing(true);
  }

  async function cancelCurrentJob() {
    if (!jobId) return;
    try {
      await fetch(`/api/v1/jobs/${jobId}/cancel`, { method: 'POST' });
      addToast('success', 'Processing cancelled');
    } catch {
      addToast('error', 'Failed to cancel job');
    }
  }

  async function handleApply(
    id: string,
    fields: string[],
    options: { allowClearing: boolean; createMissingEntities: boolean },
  ) {
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, ...options }),
      });
      if (res.ok) {
        addToast('success', 'Result applied successfully');
        invalidateAll();
      } else {
        const json = await res.json();
        addToast('error', json.error?.message ?? 'Failed to apply result');
      }
    } catch {
      addToast('error', 'Failed to apply result');
    }
  }

  async function handleReject(id: string) {
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/reject`, {
        method: 'POST',
      });
      if (res.ok) {
        addToast('success', 'Result rejected');
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
    const fields: string[] = [];
    if (result.suggestedCorrespondent) fields.push('correspondent');
    if (result.suggestedDocumentType) fields.push('documentType');
    if (result.suggestedTags.length > 0) fields.push('tags');
    if (fields.length === 0) fields.push('correspondent', 'documentType', 'tags');
    await handleApply(id, fields, { allowClearing: false, createMissingEntities: true });
  }

  function buildApplyScope(): Record<string, unknown> | null {
    const mode = getSelectionMode();
    if (mode.type === 'all_matching_filter') {
      return { type: 'current_filter', filters: mode.filters };
    }
    const ids = [...selectedIds];
    if (ids.length === 0) return null;
    return { type: 'selected_result_ids', resultIds: ids };
  }

  async function runPreflight(scope: Record<string, unknown>) {
    preflightLoading = true;
    preflightData = null;
    showPreflight = true;
    pendingApplyScope = scope;
    try {
      const res = await fetch('/api/v1/ai/results/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (res.ok) {
        preflightData = json.data;
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
        clearFilterSelection();
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

  async function executeApply(scope: Record<string, unknown>) {
    showPreflight = false;
    try {
      const res = await fetch('/api/v1/ai/results/batch-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        connectApplySSE(json.data.jobId);
      } else if (res.ok) {
        // Synchronous result (no job)
        const { applied, failed } = json.data;
        if (failed > 0) {
          addToast('warning', `Batch apply: ${applied} succeeded, ${failed} failed`);
        } else {
          addToast('success', `Applied ${applied} results`);
        }
        selectedIds.clear();
        clearFilterSelection();
        invalidateAll();
      } else {
        addToast('error', json.error?.message ?? 'Batch apply failed');
      }
    } catch {
      addToast('error', 'Batch apply failed');
    }
  }

  function handlePreflightConfirm() {
    if (pendingApplyScope) {
      executeApply(pendingApplyScope);
    }
  }

  function handlePreflightCancel() {
    showPreflight = false;
    preflightData = null;
    pendingApplyScope = null;
  }

  async function handleBatchApply() {
    const scope = buildApplyScope();
    if (!scope) return;
    await runPreflight(scope);
  }

  async function handleBatchReject() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
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

  async function handleApplyAll() {
    const scope = { type: 'all_pending' };
    await runPreflight(scope);
  }

  async function handleRejectAll() {
    try {
      const res = await fetch('/api/v1/ai/results/reject-all', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        addToast('success', `Rejected ${json.data.rejected} pending results`);
        invalidateAll();
      } else {
        addToast('error', json.error?.message ?? 'Reject all failed');
      }
    } catch {
      addToast('error', 'Reject all failed');
    }
  }

  function handleFilterApply(filters: Record<string, string | undefined>) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    goto(`/ai-processing?${params.toString()}`);
  }

  function handleSelectAllFilter() {
    const filters = {
      status: data.status,
      search: data.search,
      sort: data.sort,
      changedOnly: data.changedOnly,
      failed: data.failed,
      minConfidence: data.minConfidence,
      maxConfidence: data.maxConfidence,
      provider: data.provider ?? undefined,
      model: data.model ?? undefined,
    };
    selectAllMatchingFilter(filters, data.total);
  }

  function handleClearFilterSelection() {
    clearFilterSelection();
  }

  function handleSelectGroup(resultIds: string[]) {
    clearFilterSelection();
    selectedIds.clear();
    for (const id of resultIds) {
      selectedIds.add(id);
    }
  }

  function goToPage(p: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', String((p - 1) * data.limit));
    goto(`/ai-processing?${params.toString()}`);
  }
</script>

<svelte:head>
  <title>AI Processing - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-1">
      <h1 class="text-ink flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
        <div class="bg-accent-light flex h-8 w-8 items-center justify-center rounded-lg">
          <Brain class="text-accent h-4.5 w-4.5" />
        </div>
        AI Processing
      </h1>
      <p class="text-muted text-sm">Extract and apply document metadata using AI.</p>
    </div>
    <div class="relative flex gap-2">
      <button
        onclick={handleProcessNew}
        disabled={isProcessing}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
      >
        {#if isProcessing}
          <Loader2 class="h-4 w-4 animate-spin" />
          Processing...
        {:else}
          <Play class="h-4 w-4" />
          {isResumable ? 'Resume' : 'Process New'}
        {/if}
      </button>
      <div class="relative">
        <button
          onclick={() => (showProcessMenu = !showProcessMenu)}
          disabled={isProcessing}
          class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <ChevronDown class="h-4 w-4" />
        </button>
        {#if showProcessMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="border-soft bg-surface absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border shadow-lg"
            onmouseleave={() => (showProcessMenu = false)}
          >
            <button
              onclick={handleProcessNew}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <Play class="h-4 w-4" /> Process New
            </button>
            {#if stats.failed > 0}
              <button
                onclick={handleRetryFailed}
                class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
              >
                <RefreshCw class="h-4 w-4" /> Retry Failed
              </button>
            {/if}
            <button
              onclick={() => {
                showProcessMenu = false;
                showDocPicker = true;
              }}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <FileText class="h-4 w-4" /> Process Selected...
            </button>
            {#if hasActiveFilters}
              <button
                onclick={handleRerunCurrentFilter}
                class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
              >
                <RefreshCw class="h-4 w-4" /> Re-run Current Filter
              </button>
            {/if}
            <div class="border-soft border-t"></div>
            <button
              onclick={() => {
                showProcessMenu = false;
                confirmReprocessAll = true;
              }}
              class="text-ember hover:bg-ember-light flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <AlertCircle class="h-4 w-4" /> Re-run Entire Library
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Stats Cards -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <div class="panel flex items-center gap-3 p-4">
      <div class="bg-accent-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <FileText class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Processed</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.totalProcessed.toLocaleString()}
        </p>
      </div>
    </div>
    <div class="panel flex items-center gap-3 p-4">
      <div class="bg-warn-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <CircleDot class="text-warn h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Pending</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.pendingReview.toLocaleString()}
        </p>
      </div>
    </div>
    <div class="panel flex items-center gap-3 p-4">
      <div class="bg-success-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <CircleCheck class="text-success h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Applied</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.applied.toLocaleString()}
        </p>
      </div>
    </div>
    <div class="panel flex items-center gap-3 p-4">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
        <CircleX class="text-muted h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Rejected</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.rejected.toLocaleString()}
        </p>
      </div>
    </div>
    <div class="panel flex items-center gap-3 p-4">
      <div class="bg-ember-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <TriangleAlert class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Failed</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.failed.toLocaleString()}
        </p>
      </div>
    </div>
  </div>

  <!-- Progress Panel -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 text-sm font-medium">
          <Loader2 class="text-accent h-4 w-4 animate-spin" />
          <span class="text-ink">Processing documents...</span>
        </div>
        <button
          onclick={cancelCurrentJob}
          class="border-soft text-muted hover:text-ink hover:bg-canvas flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Pause class="h-4 w-4" />
          Pause
        </button>
      </div>
      <div class="mt-3">
        <ProgressBar progress={jobProgress} phaseProgress={jobPhaseProgress} message={jobMessage} />
      </div>
    </div>
  {/if}

  <!-- Error Banner -->
  {#if jobError}
    <div class="bg-ember-light border-ember/20 flex items-start gap-3 rounded-xl border p-4">
      <div class="bg-ember/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <AlertCircle class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing failed</p>
        <p class="text-ink-light mt-0.5 text-sm break-words">{jobError}</p>
      </div>
      <button
        onclick={() => (jobError = null)}
        class="text-muted hover:text-ink -mt-0.5 shrink-0 rounded-lg p-1 transition-colors"
        title="Dismiss"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/if}

  <!-- Resume Hint -->
  {#if showResumeHint}
    <div class="bg-accent-light border-accent/20 flex items-start gap-3 rounded-xl border p-4">
      <div class="bg-accent/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Info class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing paused</p>
        <p class="text-ink-light mt-0.5 text-sm">
          {stats.unprocessed.toLocaleString()} document{stats.unprocessed === 1 ? '' : 's'} remaining.
          Click "{isResumable ? 'Resume' : 'Process New'}" to continue from where you left off.
        </p>
      </div>
      <button
        onclick={() => (showResumeHint = false)}
        class="text-muted hover:text-ink -mt-0.5 shrink-0 rounded-lg p-1 transition-colors"
        title="Dismiss"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/if}

  <!-- Filter Bar -->
  <AiFilterBar
    status={data.status}
    search={data.search}
    sort={data.sort}
    groupBy={data.groupBy ?? undefined}
    changedOnly={data.changedOnly}
    failed={data.failed}
    minConfidence={data.minConfidence}
    provider={data.provider ?? undefined}
    model={data.model ?? undefined}
    onapply={handleFilterApply}
  />

  <!-- Bulk Action Bar -->
  <AiBulkActionBar
    selectedCount={selectedIds.size}
    pendingCount={stats.pendingReview}
    {selectionMode}
    totalFilterMatch={data.total}
    onbatchapply={handleBatchApply}
    onbatchreject={handleBatchReject}
    onapplyall={handleApplyAll}
    onrejectall={handleRejectAll}
    onselectallfilter={handleSelectAllFilter}
    onclearfilterselection={handleClearFilterSelection}
  />

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
      {#if data.groups && data.groupBy}
        <AiResultGroupedList
          groups={data.groups.groups}
          groupBy={data.groupBy}
          onselectgroup={handleSelectGroup}
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
      {#if totalPages > 1}
        <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p class="text-muted text-sm">
            Showing <span class="text-ink font-medium"
              >{data.offset + 1}&ndash;{Math.min(data.offset + data.limit, data.total)}</span
            >
            of <span class="text-ink font-medium">{data.total}</span>
          </p>
          <div class="flex items-center gap-1">
            <button
              onclick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 transition-colors disabled:opacity-30"
            >
              <ChevronLeft class="h-4 w-4" />
            </button>
            <span class="text-ink px-3 text-sm font-medium tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              onclick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 transition-colors disabled:opacity-30"
            >
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Desktop Detail Drawer -->
    {#if activeResultId && !isMobile}
      <AiResultDetailDrawer onapply={handleApply} onreject={handleReject} onclose={closeDetail} />
    {/if}
  </div>

  <!-- Mobile Detail Drawer -->
  {#if activeResultId && isMobile}
    <AiResultDetailDrawer
      mobile
      onapply={handleApply}
      onreject={handleReject}
      onclose={closeDetail}
    />
  {/if}
</div>

<!-- Overlays -->
<AiToastContainer />
<AiKeyboardHandler
  {results}
  onapply={handleApplySimple}
  onreject={handleReject}
  searchInputRef={null}
/>
<AiDocumentPickerModal
  open={showDocPicker}
  onsubmit={handleProcessSelected}
  oncancel={() => (showDocPicker = false)}
/>
<AiPreflightDialog
  open={showPreflight}
  preflight={preflightData}
  loading={preflightLoading}
  onconfirm={handlePreflightConfirm}
  oncancel={handlePreflightCancel}
/>
<ConfirmDialog
  open={confirmReprocessAll}
  title="Re-run Entire Library?"
  message="This will re-process all documents in your library. Existing AI results will be overwritten. This may take a significant amount of time and API usage."
  confirmLabel="Re-run All"
  variant="ember"
  onconfirm={handleReprocessAll}
  oncancel={() => (confirmReprocessAll = false)}
/>
