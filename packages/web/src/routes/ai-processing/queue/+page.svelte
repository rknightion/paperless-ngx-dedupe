<script lang="ts">
  import { getContext } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { SvelteSet } from 'svelte/reactivity';
  import type { AiStats, UnprocessedDocument, DetailedCostEstimate } from '@paperless-dedupe/core';
  import {
    FileText,
    AlertCircle,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    CheckSquare,
    Square,
    Play,
    Inbox,
    CircleX,
    DollarSign,
    BarChart3,
  } from 'lucide-svelte';
  import { addToast } from '$lib/components/ai/AiReviewStore.svelte';
  import AiCostComparisonDialog from '$lib/components/ai/AiCostComparisonDialog.svelte';
  import QueueFilterBar from '$lib/components/ai/QueueFilterBar.svelte';

  let { data } = $props();

  interface AiLayoutContext {
    readonly isProcessing: boolean;
    readonly stats: AiStats;
    startProcessing: (reprocess?: boolean) => Promise<void>;
    startProcessingWithScope: (scope: Record<string, unknown>, label: string) => Promise<void>;
    cancelCurrentJob: () => Promise<void>;
  }

  const layoutCtx = getContext<AiLayoutContext>('ai-layout');

  // ── Selection state ──
  const selectedDocIds = new SvelteSet<string>();

  const allSelected = $derived(
    data.unprocessed.items.length > 0 &&
      data.unprocessed.items.every((d: UnprocessedDocument) => selectedDocIds.has(d.id)),
  );

  function toggleSelectAll() {
    if (allSelected) {
      selectedDocIds.clear();
    } else {
      selectedDocIds.clear();
      for (const d of data.unprocessed.items) {
        selectedDocIds.add(d.id);
      }
    }
  }

  function toggleDoc(id: string) {
    if (selectedDocIds.has(id)) {
      selectedDocIds.delete(id);
    } else {
      selectedDocIds.add(id);
    }
  }

  // ── Pagination ──
  const totalPages = $derived(Math.ceil(data.unprocessed.total / 20));
  const offset = $derived(
    Math.max(parseInt($page.url.searchParams.get('offset') ?? '0', 10) || 0, 0),
  );
  const currentPage = $derived(Math.floor(offset / 20) + 1);

  function goToPage(p: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', String((p - 1) * 20));
    goto(`/ai-processing/queue?${params.toString()}`);
  }

  // ── Handlers ──
  function handleProcessAllUnprocessed() {
    layoutCtx.startProcessing(false);
  }

  function handleProcessSelected() {
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    layoutCtx.startProcessingWithScope(
      { type: 'selected_document_ids', documentIds: ids },
      `Processing ${ids.length} selected document${ids.length === 1 ? '' : 's'}`,
    );
    selectedDocIds.clear();
  }

  function handleRetryAllFailed() {
    layoutCtx.startProcessingWithScope({ type: 'failed_only' }, 'Retrying failed documents');
  }

  function handleRetryOne(resultId: string) {
    layoutCtx.startProcessingWithScope(
      { type: 'selected_result_ids', resultIds: [resultId] },
      'Retrying failed document',
    );
  }

  async function handleDismissOne(resultId: string) {
    try {
      const res = await fetch(`/api/v1/ai/results/${resultId}/reject`, { method: 'POST' });
      if (res.ok) {
        addToast('success', 'Result dismissed');
        invalidateAll();
      } else {
        addToast('error', 'Failed to dismiss result');
      }
    } catch {
      addToast('error', 'Failed to dismiss result');
    }
  }

  // ── Cost estimation ──
  let costEstimate: DetailedCostEstimate | null = $state(null);
  let costLoading = $state(false);
  let costError = $state(false);
  let showCostComparison = $state(false);

  $effect(() => {
    if (data.unprocessed.total > 0) {
      costLoading = true;
      costError = false;
      fetch('/api/v1/ai/costs/estimate-detailed')
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((json) => {
          costEstimate = json.data as DetailedCostEstimate;
          costLoading = false;
        })
        .catch(() => {
          costEstimate = null;
          costLoading = false;
          costError = true;
        });
    } else {
      costEstimate = null;
    }
  });

  // ── Filters ──
  const hasActiveFilters = $derived(
    !!(
      data.filters.search ||
      data.filters.correspondent ||
      data.filters.documentType ||
      data.filters.tag ||
      data.filters.sort
    ),
  );

  function handleFilterApply(filters: Record<string, string | undefined>) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, value);
    }
    goto(`/ai-processing/queue?${params.toString()}`);
  }

  // Clear stale selections when items change
  $effect(() => {
    const currentIds = new Set(data.unprocessed.items.map((d: UnprocessedDocument) => d.id));
    for (const id of selectedDocIds) {
      if (!currentIds.has(id)) selectedDocIds.delete(id);
    }
  });

  function formatCostRange(est: DetailedCostEstimate): string {
    const best = est.currentModel.bestCase.totalCostUsd;
    const worst = est.currentModel.worstCase.totalCostUsd;
    const fmt = (v: number) => (v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`);
    if (best === worst) return fmt(worst);
    return `${fmt(best)} – ${fmt(worst)}`;
  }
</script>

<div class="space-y-6">
  <!-- Unprocessed Documents Section -->
  <section class="space-y-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-0.5">
        <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
          <Inbox class="h-5 w-5" />
          Unprocessed Documents
        </h2>
        <p class="text-muted text-sm">
          {data.unprocessed.total.toLocaleString()} document{data.unprocessed.total === 1
            ? ''
            : 's'} waiting for AI processing.
        </p>
      </div>
      <div class="flex gap-2">
        {#if selectedDocIds.size > 0}
          <button
            onclick={handleProcessSelected}
            disabled={layoutCtx.isProcessing}
            class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <Play class="h-4 w-4" />
            Process {selectedDocIds.size} Selected
          </button>
        {/if}
        {#if data.unprocessed.total > 0}
          <button
            onclick={handleProcessAllUnprocessed}
            disabled={layoutCtx.isProcessing}
            class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Play class="h-4 w-4" />
            Process All Unprocessed
          </button>
        {/if}
      </div>
    </div>

    <!-- Filter bar -->
    <QueueFilterBar
      search={data.filters.search}
      sort={data.filters.sort}
      correspondent={data.filters.correspondent}
      documentType={data.filters.documentType}
      tag={data.filters.tag}
      seed={data.filters.seed}
      correspondents={data.facets.correspondents}
      documentTypes={data.facets.documentTypes}
      onapply={handleFilterApply}
    />

    <!-- Cost estimate banner -->
    {#if costLoading}
      <div class="border-soft bg-surface flex items-center gap-3 rounded-lg border px-4 py-3">
        <div class="bg-canvas-alt h-4 w-4 animate-pulse rounded"></div>
        <div class="flex-1 space-y-1.5">
          <div class="bg-canvas-alt h-4 w-32 animate-pulse rounded"></div>
          <div class="bg-canvas-alt h-3 w-48 animate-pulse rounded"></div>
        </div>
      </div>
    {:else if costEstimate}
      <div
        class="border-soft bg-surface flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3">
          <div
            class="bg-accent-light mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          >
            <DollarSign class="text-accent h-4 w-4" />
          </div>
          <div>
            <p class="text-ink text-sm font-medium">
              Estimated cost: <span class="tabular-nums">{formatCostRange(costEstimate)}</span>
              <span class="text-muted font-normal">with {costEstimate.currentModel.modelName}</span>
            </p>
            <p class="text-muted mt-0.5 text-xs">
              {costEstimate.documentCount.toLocaleString()} document{costEstimate.documentCount ===
              1
                ? ''
                : 's'}, ~{Math.round(
                (costEstimate.tokenBreakdown.systemPromptTokens +
                  costEstimate.tokenBreakdown.totalUserPromptTokens / costEstimate.documentCount) /
                  1,
              ).toLocaleString()} tokens per document avg
            </p>
          </div>
        </div>
        <button
          onclick={() => (showCostComparison = true)}
          class="border-soft text-ink hover:bg-canvas flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <BarChart3 class="h-3.5 w-3.5" />
          Compare Models
        </button>
      </div>
    {:else if costError}
      <div class="border-soft bg-surface flex items-center gap-3 rounded-lg border px-4 py-3">
        <DollarSign class="text-muted h-4 w-4" />
        <p class="text-muted text-sm">Cost estimate unavailable</p>
      </div>
    {/if}

    {#if data.unprocessed.items.length === 0}
      <div class="panel flex flex-col items-center py-12 text-center">
        <div class="bg-success-light mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <FileText class="text-success h-7 w-7" />
        </div>
        {#if hasActiveFilters}
          <p class="text-ink text-sm font-medium">No documents match your filters</p>
          <p class="text-muted mt-1 text-sm">Try adjusting your search or filter criteria.</p>
        {:else}
          <p class="text-ink text-sm font-medium">All documents have been processed</p>
          <p class="text-muted mt-1 text-sm">
            There are no unprocessed documents remaining in the queue.
          </p>
        {/if}
      </div>
    {:else}
      <div class="panel overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-soft border-b text-left">
              <th class="p-3">
                <button
                  onclick={toggleSelectAll}
                  class="text-muted hover:text-ink transition-colors"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                >
                  {#if allSelected}
                    <CheckSquare class="h-4 w-4" />
                  {:else}
                    <Square class="h-4 w-4" />
                  {/if}
                </button>
              </th>
              <th class="text-muted p-3 text-xs font-medium tracking-wider uppercase">Title</th>
              <th
                class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase sm:table-cell"
                >Correspondent</th
              >
              <th
                class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase md:table-cell"
                >Document Type</th
              >
              <th
                class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase lg:table-cell"
                >Tags</th
              >
            </tr>
          </thead>
          <tbody>
            {#each data.unprocessed.items as doc (doc.id)}
              {@const isSelected = selectedDocIds.has(doc.id)}
              <tr
                class="border-soft hover:bg-canvas border-b transition-colors last:border-b-0 {isSelected
                  ? 'bg-accent-light/30'
                  : ''}"
              >
                <td class="p-3">
                  <button
                    onclick={() => toggleDoc(doc.id)}
                    class="text-muted hover:text-ink transition-colors"
                  >
                    {#if isSelected}
                      <CheckSquare class="text-accent h-4 w-4" />
                    {:else}
                      <Square class="h-4 w-4" />
                    {/if}
                  </button>
                </td>
                <td class="p-3">
                  <span class="text-ink text-sm font-medium">{doc.title}</span>
                </td>
                <td class="hidden p-3 sm:table-cell">
                  <span class="text-muted text-sm">{doc.correspondent ?? '--'}</span>
                </td>
                <td class="hidden p-3 md:table-cell">
                  <span class="text-muted text-sm">{doc.documentType ?? '--'}</span>
                </td>
                <td class="hidden p-3 lg:table-cell">
                  <div class="flex flex-wrap gap-1">
                    {#each doc.tags as tag (tag)}
                      <span
                        class="bg-canvas-alt text-muted rounded-full px-2 py-0.5 text-xs font-medium"
                        >{tag}</span
                      >
                    {:else}
                      <span class="text-muted text-sm">--</span>
                    {/each}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p class="text-muted text-sm">
            Showing <span class="text-ink font-medium"
              >{offset + 1}&ndash;{Math.min(offset + 20, data.unprocessed.total)}</span
            >
            of <span class="text-ink font-medium">{data.unprocessed.total}</span>
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
  </section>

  <!-- Failed Results Section -->
  {#if data.failed.items.length > 0}
    <section class="space-y-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-0.5">
          <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
            <AlertCircle class="text-ember h-5 w-5" />
            Failed Results
          </h2>
          <p class="text-muted text-sm">
            {data.failed.total} result{data.failed.total === 1 ? '' : 's'} failed during processing.
          </p>
        </div>
        {#if data.failed.total > 0}
          <button
            onclick={handleRetryAllFailed}
            disabled={layoutCtx.isProcessing}
            class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw class="h-4 w-4" />
            Retry All Failed
          </button>
        {/if}
      </div>

      <div class="space-y-2">
        {#each data.failed.items as result (result.id)}
          <div class="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-ink truncate text-sm font-medium">{result.documentTitle}</p>
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
            </div>
            {#if result.failureType === 'no_suggestions'}
              <button
                onclick={() => handleDismissOne(result.id)}
                disabled={layoutCtx.isProcessing}
                class="border-soft text-ink hover:bg-canvas flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <CircleX class="h-3.5 w-3.5" />
                Dismiss
              </button>
            {:else}
              <button
                onclick={() => handleRetryOne(result.id)}
                disabled={layoutCtx.isProcessing}
                class="border-soft text-ink hover:bg-canvas flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw class="h-3.5 w-3.5" />
                Retry
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if costEstimate}
  <AiCostComparisonDialog
    open={showCostComparison}
    documentCount={costEstimate.documentCount}
    allModels={costEstimate.allModels}
    currentModelId={costEstimate.currentModel.modelId}
    reasoningEffort={data.reasoningEffort ?? 'low'}
    onclose={() => (showCostComparison = false)}
  />
{/if}
