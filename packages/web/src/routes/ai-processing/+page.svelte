<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ProgressBar } from '$lib/components';
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
  } from 'lucide-svelte';

  let { data } = $props();

  let isProcessing = $state(false);
  let jobId = $state<string | null>(data.activeJob?.id ?? null);
  let jobProgress = $state(data.activeJob?.progress ?? 0);
  let jobPhaseProgress = $state<number | undefined>(undefined);
  let jobMessage = $state(data.activeJob?.message ?? '');
  let sseConnection: { close: () => void } | null = null;
  let selectedIds = $state<Set<string>>(new Set());
  let selectAll = $state(false);
  let isApplying = $state(false);
  let statusFilter = $state(data.status ?? '');
  let searchQuery = $state(data.search ?? '');

  let stats = $derived(data.stats);
  let results = $derived(data.results);
  let totalPages = $derived(Math.ceil(data.total / data.limit));
  let currentPage = $derived(Math.floor(data.offset / data.limit) + 1);

  function connectSSE(id: string) {
    sseConnection?.close();
    isProcessing = true;
    sseConnection = connectJobSSE(id, {
      onProgress: (d) => {
        jobProgress = d.progress;
        jobPhaseProgress = d.phaseProgress;
        jobMessage = d.message ?? '';
      },
      onComplete: () => {
        isProcessing = false;
        jobId = null;
        jobProgress = 1;
        jobPhaseProgress = undefined;
        jobMessage = 'Processing complete';
        sseConnection = null;
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

  function confidenceColor(score: number): string {
    if (score >= 0.8) return 'text-success';
    if (score >= 0.5) return 'text-warn';
    return 'text-ember';
  }
</script>

<svelte:head>
  <title>AI Processing - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-1">
      <h1 class="text-ink flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Brain class="text-accent h-6 w-6" />
        AI Processing
      </h1>
      <p class="text-muted text-sm">Extract and apply document metadata using AI.</p>
    </div>
    <div class="flex gap-2">
      <button
        onclick={() => startProcessing(false)}
        disabled={isProcessing}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
        class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        <RefreshCw class="h-4 w-4" />
        Re-process All
      </button>
    </div>
  </header>

  <!-- Stats -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <div class="panel flex flex-col items-center p-4 text-center">
      <span class="text-muted text-xs font-medium tracking-wide uppercase">Processed</span>
      <span class="text-ink mt-1 text-2xl font-bold">{stats.totalProcessed.toLocaleString()}</span>
    </div>
    <div class="panel flex flex-col items-center p-4 text-center">
      <span class="text-muted text-xs font-medium tracking-wide uppercase">Pending</span>
      <span class="text-warn mt-1 text-2xl font-bold">{stats.pendingReview.toLocaleString()}</span>
    </div>
    <div class="panel flex flex-col items-center p-4 text-center">
      <span class="text-muted text-xs font-medium tracking-wide uppercase">Applied</span>
      <span class="text-success mt-1 text-2xl font-bold">{stats.applied.toLocaleString()}</span>
    </div>
    <div class="panel flex flex-col items-center p-4 text-center">
      <span class="text-muted text-xs font-medium tracking-wide uppercase">Rejected</span>
      <span class="text-muted mt-1 text-2xl font-bold">{stats.rejected.toLocaleString()}</span>
    </div>
    <div class="panel flex flex-col items-center p-4 text-center">
      <span class="text-muted text-xs font-medium tracking-wide uppercase">Failed</span>
      <span class="text-ember mt-1 text-2xl font-bold">{stats.failed.toLocaleString()}</span>
    </div>
  </div>

  <!-- Progress -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Loader2 class="text-accent h-4 w-4 animate-spin" />
        <span class="text-ink">Processing documents...</span>
      </div>
      <div class="mt-3">
        <ProgressBar progress={jobProgress} phaseProgress={jobPhaseProgress} message={jobMessage} />
      </div>
    </div>
  {/if}

  <!-- Filters & Batch Actions -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2">
      <select
        bind:value={statusFilter}
        onchange={applyFilters}
        class="border-soft bg-surface text-ink rounded-lg border px-3 py-1.5 text-sm"
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="applied">Applied</option>
        <option value="rejected">Rejected</option>
        <option value="partial">Partial</option>
      </select>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search documents..."
        onkeydown={(e) => e.key === 'Enter' && applyFilters()}
        class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent rounded-lg border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
      />
    </div>
    {#if selectedIds.size > 0}
      <div class="flex items-center gap-2">
        <span class="text-muted text-sm">{selectedIds.size} selected</span>
        <button
          onclick={batchApply}
          disabled={isApplying}
          class="bg-success-light text-success flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          <Check class="h-3.5 w-3.5" /> Apply
        </button>
        <button
          onclick={batchReject}
          class="bg-canvas text-muted flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          <X class="h-3.5 w-3.5" /> Reject
        </button>
      </div>
    {/if}
  </div>

  <!-- Results Table -->
  {#if results.length === 0}
    <div class="panel flex flex-col items-center py-12 text-center">
      <Sparkles class="text-muted mb-3 h-10 w-10" />
      <p class="text-ink font-medium">No AI results yet</p>
      <p class="text-muted mt-1 text-sm">
        Click "Process New" to start extracting metadata from your documents.
      </p>
    </div>
  {:else}
    <div class="border-soft overflow-x-auto rounded-lg border">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-soft bg-canvas border-b">
            <th class="px-4 py-3">
              <input
                type="checkbox"
                checked={selectAll}
                onchange={toggleSelectAll}
                class="rounded"
              />
            </th>
            <th class="text-muted px-4 py-3 font-medium">Document</th>
            <th class="text-muted hidden px-4 py-3 font-medium md:table-cell">Correspondent</th>
            <th class="text-muted hidden px-4 py-3 font-medium md:table-cell">Document Type</th>
            <th class="text-muted hidden px-4 py-3 font-medium lg:table-cell">Tags</th>
            <th class="text-muted px-4 py-3 font-medium">Confidence</th>
            <th class="text-muted hidden px-4 py-3 font-medium sm:table-cell">Status</th>
            <th class="text-muted px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each results as result (result.id)}
            <tr class="border-soft hover:bg-surface border-b transition-colors">
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(result.id)}
                  onchange={() => toggleSelect(result.id)}
                  class="rounded"
                />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <FileText class="text-muted h-4 w-4 shrink-0" />
                  <span class="text-ink max-w-48 truncate font-medium">
                    {result.documentTitle}
                  </span>
                </div>
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                {#if result.suggestedCorrespondent}
                  <div class="space-y-0.5">
                    {#if result.currentCorrespondent}
                      <div class="text-muted text-xs line-through">
                        {result.currentCorrespondent}
                      </div>
                    {/if}
                    <div class="text-ink text-sm">{result.suggestedCorrespondent}</div>
                  </div>
                {:else}
                  <span class="text-muted">&mdash;</span>
                {/if}
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                {#if result.suggestedDocumentType}
                  <div class="space-y-0.5">
                    {#if result.currentDocumentType}
                      <div class="text-muted text-xs line-through">
                        {result.currentDocumentType}
                      </div>
                    {/if}
                    <div class="text-ink text-sm">{result.suggestedDocumentType}</div>
                  </div>
                {:else}
                  <span class="text-muted">&mdash;</span>
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
                    <span class="text-muted">&mdash;</span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3">
                {#if result.confidence}
                  <div class="space-y-0.5 text-xs">
                    <div class={confidenceColor(result.confidence.correspondent)}>
                      C: {Math.round(result.confidence.correspondent * 100)}%
                    </div>
                    <div class={confidenceColor(result.confidence.documentType)}>
                      T: {Math.round(result.confidence.documentType * 100)}%
                    </div>
                    <div class={confidenceColor(result.confidence.tags)}>
                      G: {Math.round(result.confidence.tags * 100)}%
                    </div>
                  </div>
                {:else if result.errorMessage}
                  <span class="text-ember flex items-center gap-1 text-xs">
                    <AlertCircle class="h-3 w-3" /> Error
                  </span>
                {:else}
                  <span class="text-muted">&mdash;</span>
                {/if}
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(
                    result.appliedStatus,
                  )}"
                >
                  {result.appliedStatus}
                </span>
              </td>
              <td class="px-4 py-3">
                {#if result.appliedStatus === 'pending' && !result.errorMessage}
                  <div class="flex items-center gap-1">
                    <button
                      onclick={() => applyResult(result.id)}
                      disabled={isApplying}
                      class="text-success hover:bg-success-light rounded p-1"
                      title="Apply"
                    >
                      <Check class="h-4 w-4" />
                    </button>
                    <button
                      onclick={() => rejectResult(result.id)}
                      class="text-muted hover:bg-canvas rounded p-1"
                      title="Reject"
                    >
                      <X class="h-4 w-4" />
                    </button>
                  </div>
                {:else}
                  <span class="text-muted text-xs">&mdash;</span>
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
          Showing {data.offset + 1}&ndash;{Math.min(data.offset + data.limit, data.total)} of {data.total}
        </p>
        <div class="flex items-center gap-1">
          <button
            onclick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 disabled:opacity-30"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="text-ink px-3 text-sm font-medium">
            {currentPage} / {totalPages}
          </span>
          <button
            onclick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            class="border-soft text-muted hover:text-ink rounded-lg border p-1.5 disabled:opacity-30"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>
