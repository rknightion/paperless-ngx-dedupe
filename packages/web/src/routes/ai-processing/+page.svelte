<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ProgressBar, Tooltip, ConfidenceBadge } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';
  import {
    Brain,
    Play,
    RefreshCw,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Sparkles,
    FileText,
    AlertCircle,
    Search,
    CircleDot,
    CircleCheck,
    CircleX,
    TriangleAlert,
    Settings,
  } from 'lucide-svelte';

  let { data } = $props();

  const initialData = untrack(() => data);

  let isProcessing = $state(false);
  let jobId = $state<string | null>(initialData.activeJob?.id ?? null);
  let jobProgress = $state(initialData.activeJob?.progress ?? 0);
  let jobPhaseProgress = $state<number | undefined>(undefined);
  let jobMessage = $state(initialData.activeJob?.progressMessage ?? '');
  let jobError = $state<string | null>(null);
  let sseConnection: { close: () => void } | null = null;
  let selectedIds = $state<Set<string>>(new Set());
  let selectAll = $state(false);
  let isApplying = $state(false);
  let statusFilter = $state(initialData.status ?? '');
  let searchQuery = $state(initialData.search ?? '');
  let lastInvalidateTime = 0;
  const INVALIDATE_INTERVAL_MS = 3000;

  let stats = $derived(data.stats);
  let results = $derived(data.results);
  let totalPages = $derived(Math.ceil(data.total / data.limit));
  let currentPage = $derived(Math.floor(data.offset / data.limit) + 1);

  function connectSSE(id: string) {
    sseConnection?.close();
    isProcessing = true;
    jobError = null;
    sseConnection = connectJobSSE(id, {
      onProgress: (d) => {
        jobProgress = d.progress;
        jobPhaseProgress = d.phaseProgress;
        jobMessage = d.message ?? '';

        // Live-update results table while processing runs
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

  // Reset selection when data changes
  $effect(() => {
    void data.results;
    selectedIds = new Set();
    selectAll = false;
  });

  async function startProcessing(reprocess = false) {
    isProcessing = true;
    jobProgress = 0;
    jobError = null;
    jobMessage = 'Starting...';
    try {
      const res = await fetch('/api/v1/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        jobId = json.data.jobId;
      } else {
        isProcessing = false;
        jobMessage = json.error?.message ?? 'Failed to start processing';
      }
    } catch {
      isProcessing = false;
      jobMessage = 'Failed to start processing';
    }
  }

  async function applyResult(id: string) {
    isApplying = true;
    await fetch(`/api/v1/ai/results/${id}/apply`, { method: 'POST' });
    await invalidateAll();
    isApplying = false;
  }

  async function rejectResult(id: string) {
    await fetch(`/api/v1/ai/results/${id}/reject`, { method: 'POST' });
    await invalidateAll();
  }

  async function batchApply() {
    if (selectedIds.size === 0) return;
    isApplying = true;
    await fetch('/api/v1/ai/results/batch-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultIds: [...selectedIds] }),
    });
    selectedIds = new Set();
    selectAll = false;
    await invalidateAll();
    isApplying = false;
  }

  async function batchReject() {
    if (selectedIds.size === 0) return;
    await fetch('/api/v1/ai/results/batch-reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultIds: [...selectedIds] }),
    });
    selectedIds = new Set();
    selectAll = false;
    await invalidateAll();
  }

  function toggleSelect(id: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    if (selectAll) {
      selectedIds = new Set();
      selectAll = false;
    } else {
      selectedIds = new Set(results.map((r) => r.id));
      selectAll = true;
    }
  }

  function applyFilters() {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (searchQuery) params.set('search', searchQuery);
    goto(`/ai-processing?${params.toString()}`);
  }

  function goToPage(p: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', String((p - 1) * data.limit));
    goto(`/ai-processing?${params.toString()}`);
  }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'applied':
        return 'bg-success-light text-success';
      case 'rejected':
        return 'text-muted bg-canvas';
      case 'partial':
        return 'bg-accent-light text-accent';
      default:
        return 'bg-warn-light text-warn';
    }
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
    <div class="flex gap-2">
      <button
        onclick={() => startProcessing(false)}
        disabled={isProcessing}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
      >
        {#if isProcessing}
          <Loader2 class="h-4 w-4 animate-spin" />
          Processing...
        {:else}
          <Play class="h-4 w-4" />
          Process New
        {/if}
      </button>
      <button
        onclick={() => startProcessing(true)}
        disabled={isProcessing}
        class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <RefreshCw class="h-4 w-4" />
        Re-process All
      </button>
    </div>
  </header>

  <!-- Stats -->
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

  <!-- Progress -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center gap-2.5 text-sm font-medium">
        <Loader2 class="text-accent h-4 w-4 animate-spin" />
        <span class="text-ink">Processing documents...</span>
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

  <!-- Filters & Batch Actions -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2">
      <select
        bind:value={statusFilter}
        onchange={applyFilters}
        class="border-soft bg-surface text-ink rounded-lg border px-3 py-1.5 text-sm transition-colors"
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="applied">Applied</option>
        <option value="rejected">Rejected</option>
        <option value="partial">Partial</option>
      </select>
      <div class="relative">
        <Search
          class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
        />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search documents..."
          onkeydown={(e) => e.key === 'Enter' && applyFilters()}
          class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent rounded-lg border py-1.5 pr-3 pl-8 text-sm transition-colors focus:ring-1 focus:outline-none"
        />
      </div>
    </div>
    {#if selectedIds.size > 0}
      <div class="flex items-center gap-2">
        <span class="text-muted text-sm font-medium">{selectedIds.size} selected</span>
        <button
          onclick={batchApply}
          disabled={isApplying}
          class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Check class="h-3.5 w-3.5" /> Apply
        </button>
        <button
          onclick={batchReject}
          class="text-muted hover:bg-canvas flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <X class="h-3.5 w-3.5" /> Reject
        </button>
      </div>
    {/if}
  </div>

  <!-- Results Table -->
  {#if results.length === 0}
    <div class="panel flex flex-col items-center py-16 text-center">
      <div class="bg-accent-subtle mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
        <Sparkles class="text-accent h-7 w-7" />
      </div>
      <p class="text-ink text-base font-medium">No AI results yet</p>
      <p class="text-muted mx-auto mt-2 max-w-sm text-sm">
        Click "Process New" to extract metadata from your documents using AI. Make sure you've
        configured your AI provider in
        <a
          href="/settings"
          class="text-accent hover:text-accent-hover decoration-accent/30 inline-flex items-center gap-1 underline underline-offset-2"
        >
          <Settings class="h-3 w-3" />
          Settings</a
        >.
      </p>
    </div>
  {:else}
    <div class="border-soft overflow-x-auto rounded-xl border">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-soft bg-canvas/60 border-b">
            <th class="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={selectAll}
                onchange={toggleSelectAll}
                class="rounded"
              />
            </th>
            <th class="text-muted px-4 py-3 text-xs font-medium tracking-wide uppercase"
              >Document</th
            >
            <th
              class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
              >Correspondent</th
            >
            <th
              class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
              >Document Type</th
            >
            <th
              class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase lg:table-cell"
              >Tags</th
            >
            <th class="text-muted px-4 py-3 text-xs font-medium tracking-wide uppercase"
              >Confidence</th
            >
            <th
              class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase sm:table-cell"
              >Status</th
            >
            <th class="text-muted w-24 px-4 py-3 text-xs font-medium tracking-wide uppercase"
              >Actions</th
            >
          </tr>
        </thead>
        <tbody>
          {#each results as result (result.id)}
            <tr
              class="border-soft group hover:bg-accent-subtle/40 border-b transition-colors last:border-b-0"
            >
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(result.id)}
                  onchange={() => toggleSelect(result.id)}
                  class="rounded"
                />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <FileText class="text-muted h-4 w-4 shrink-0" />
                  <span class="text-ink max-w-52 truncate font-medium">
                    {result.documentTitle}
                  </span>
                </div>
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                {#if result.suggestedCorrespondent}
                  <div class="space-y-0.5">
                    {#if result.currentCorrespondent && result.currentCorrespondent !== result.suggestedCorrespondent}
                      <div class="text-muted text-xs line-through">
                        {result.currentCorrespondent}
                      </div>
                    {/if}
                    <div class="text-ink text-sm">{result.suggestedCorrespondent}</div>
                  </div>
                {:else}
                  <span class="text-soft">&mdash;</span>
                {/if}
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                {#if result.suggestedDocumentType}
                  <div class="space-y-0.5">
                    {#if result.currentDocumentType && result.currentDocumentType !== result.suggestedDocumentType}
                      <div class="text-muted text-xs line-through">
                        {result.currentDocumentType}
                      </div>
                    {/if}
                    <div class="text-ink text-sm">{result.suggestedDocumentType}</div>
                  </div>
                {:else}
                  <span class="text-soft">&mdash;</span>
                {/if}
              </td>
              <td class="hidden px-4 py-3 lg:table-cell">
                <div class="flex flex-wrap gap-1">
                  {#each result.suggestedTags as tag (tag)}
                    <span
                      class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium"
                    >
                      {tag}
                    </span>
                  {/each}
                  {#if result.suggestedTags.length === 0}
                    <span class="text-soft">&mdash;</span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3">
                {#if result.confidence}
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="text-muted w-9 text-[10px] font-medium uppercase">Corr</span>
                      <ConfidenceBadge score={result.confidence.correspondent} />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-muted w-9 text-[10px] font-medium uppercase">Type</span>
                      <ConfidenceBadge score={result.confidence.documentType} />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-muted w-9 text-[10px] font-medium uppercase">Tags</span>
                      <ConfidenceBadge score={result.confidence.tags} />
                    </div>
                  </div>
                {:else if result.errorMessage}
                  <Tooltip text={result.errorMessage} position="left">
                    <span
                      class="bg-ember-light text-ember inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    >
                      <AlertCircle class="h-3 w-3" /> Error
                    </span>
                  </Tooltip>
                {:else}
                  <span class="text-soft">&mdash;</span>
                {/if}
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize {statusBadgeClass(
                    result.appliedStatus,
                  )}"
                >
                  {result.appliedStatus}
                </span>
              </td>
              <td class="px-4 py-3">
                {#if result.appliedStatus === 'pending' && !result.errorMessage}
                  <div class="flex items-center gap-0.5">
                    <button
                      onclick={() => applyResult(result.id)}
                      disabled={isApplying}
                      class="text-success hover:bg-success-light rounded-lg p-1.5 transition-colors"
                      title="Apply suggestions"
                    >
                      <Check class="h-4 w-4" />
                    </button>
                    <button
                      onclick={() => rejectResult(result.id)}
                      class="text-muted hover:text-ink hover:bg-canvas rounded-lg p-1.5 transition-colors"
                      title="Reject suggestions"
                    >
                      <X class="h-4 w-4" />
                    </button>
                  </div>
                {:else}
                  <span class="text-soft text-xs">&mdash;</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex flex-wrap items-center justify-between gap-4">
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
  {/if}
</div>
