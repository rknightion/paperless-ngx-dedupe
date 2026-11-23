<script lang="ts">
  import { getContext } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { SvelteSet } from 'svelte/reactivity';
  import { Button, Select } from '$lib/components';
  import type { AiStats, UnprocessedDocument, DetailedCostEstimate } from '@paperless-dedupe/core';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import ChartBarIcon from 'phosphor-svelte/lib/ChartBarIcon';
  import CheckSquareIcon from 'phosphor-svelte/lib/CheckSquareIcon';
  import CurrencyDollarIcon from 'phosphor-svelte/lib/CurrencyDollarIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import SquareIcon from 'phosphor-svelte/lib/SquareIcon';
  import TrayIcon from 'phosphor-svelte/lib/TrayIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
  import { addToast } from '$lib/components/ai/AiReviewStore.svelte';
  import AiCostComparisonDialog from '$lib/components/ai/AiCostComparisonDialog.svelte';
  import QueueFilterBar from '$lib/components/ai/QueueFilterBar.svelte';

  let { data } = $props();

  const PAGE_SIZE_OPTIONS = [
    { value: '20', label: '20 / page' },
    { value: '50', label: '50 / page' },
    { value: '100', label: '100 / page' },
  ];

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
  const totalPages = $derived(Math.ceil(data.unprocessed.total / data.limit));
  const offset = $derived(
    Math.max(parseInt(page.url.searchParams.get('offset') ?? '0', 10) || 0, 0),
  );
  const currentPage = $derived(Math.floor(offset / data.limit) + 1);

  function goToPage(p: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('offset', String((p - 1) * data.limit));
    goto(`/ai-processing/queue?${params.toString()}`);
  }

  function changePageSize(value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('limit', value);
    params.set('offset', '0');
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

  function handleRetryOne(documentId: string) {
    layoutCtx.startProcessingWithScope(
      { type: 'selected_document_ids', documentIds: [documentId] },
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
    return `${fmt(best)} - ${fmt(worst)}`;
  }
</script>

<div class="space-y-6">
  <!-- Unprocessed Documents Section -->
  <section class="space-y-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-0.5">
        <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
          <TrayIcon class="h-5 w-5" />
          Unprocessed documents
        </h2>
        <p class="text-muted text-sm">
          {data.unprocessed.total.toLocaleString()} document{data.unprocessed.total === 1
            ? ''
            : 's'} waiting for AI processing.
        </p>
      </div>
      <div class="flex gap-2">
        {#if selectedDocIds.size > 0}
          <Button icon={PlayIcon} onclick={handleProcessSelected} disabled={layoutCtx.isProcessing}>
            Process {selectedDocIds.size} selected
          </Button>
        {/if}
        {#if data.unprocessed.total > 0}
          <Button
            variant="outline"
            icon={PlayIcon}
            onclick={handleProcessAllUnprocessed}
            disabled={layoutCtx.isProcessing}
          >
            Process all unprocessed
          </Button>
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
      <div class="border-border bg-surface flex items-center gap-3 border px-4 py-3">
        <div class="flex-1 space-y-1.5">
          <div class="bg-canvas-deep h-4 w-32 animate-pulse"></div>
          <div class="bg-canvas-deep h-3 w-48 animate-pulse"></div>
        </div>
      </div>
    {:else if costEstimate}
      <div
        class="border-border bg-surface flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3">
          <CurrencyDollarIcon class="text-muted mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p class="text-ink text-sm font-medium">
              Estimated cost: <span class="font-mono tabular-nums">
                {formatCostRange(costEstimate)}
              </span>
              <span class="text-muted font-normal">with {costEstimate.currentModel.modelName}</span>
            </p>
            <p class="text-muted mt-0.5 font-mono text-xs">
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
        <Button
          variant="outline"
          size="sm"
          icon={ChartBarIcon}
          class="shrink-0"
          onclick={() => (showCostComparison = true)}
        >
          Compare models
        </Button>
      </div>
    {:else if costError}
      <div class="border-border bg-surface flex items-center gap-3 border px-4 py-3">
        <CurrencyDollarIcon class="text-muted h-4 w-4" />
        <p class="text-muted text-sm">Cost estimate unavailable</p>
      </div>
    {/if}

    {#if data.unprocessed.items.length === 0}
      <div class="flex flex-col items-center py-12 text-center">
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
      <div class="border-border border-y">
        <table class="w-full border-collapse [overflow-wrap:anywhere]">
          <thead>
            <tr class="text-left">
              <th
                class="bg-surface border-border-hover sticky top-0 z-10 border-b py-1.5 pr-0 pl-6"
              >
                <!-- Table selection toggles (header and rows) stay inline: they are bare
                     icon-state toggles inside table cells, not Button-shaped actions. -->
                <button
                  onclick={toggleSelectAll}
                  class="text-muted hover:text-ink transition-colors"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                >
                  {#if allSelected}
                    <CheckSquareIcon class="h-4 w-4" />
                  {:else}
                    <SquareIcon class="h-4 w-4" />
                  {/if}
                </button>
              </th>
              <th
                class="label-micro bg-surface border-border-hover sticky top-0 z-10 border-b px-3 py-1.5 text-left"
              >
                Title
              </th>
              <th
                class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 text-left sm:table-cell"
              >
                Correspondent
              </th>
              <th
                class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 text-left md:table-cell"
              >
                Document type
              </th>
              <th
                class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 text-left lg:table-cell"
              >
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {#each data.unprocessed.items as doc (doc.id)}
              {@const isSelected = selectedDocIds.has(doc.id)}
              <tr
                class="border-border h-9 border-b transition-colors {isSelected
                  ? 'bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
                  : 'hover:bg-canvas-deep'}"
              >
                <td class="py-0 pr-0 pl-6">
                  <!-- Row selection toggle: inline for the same reason as the header toggle above. -->
                  <button
                    onclick={() => toggleDoc(doc.id)}
                    aria-label={`Select ${doc.title}`}
                    aria-pressed={isSelected}
                    class="text-muted hover:text-ink transition-colors"
                  >
                    {#if isSelected}
                      <CheckSquareIcon class="text-accent h-4 w-4" />
                    {:else}
                      <SquareIcon class="h-4 w-4" />
                    {/if}
                  </button>
                </td>
                <td class="px-3 py-0">
                  <span class="text-ink text-base font-medium">{doc.title}</span>
                </td>
                <td class="hidden px-3 py-0 sm:table-cell">
                  <span class="text-muted text-sm">{doc.correspondent ?? '--'}</span>
                </td>
                <td class="hidden px-3 py-0 md:table-cell">
                  <span class="text-muted text-sm">{doc.documentType ?? '--'}</span>
                </td>
                <td class="hidden px-3 py-0 lg:table-cell">
                  <div class="flex flex-wrap gap-1">
                    {#each doc.tags as tag (tag)}
                      <span
                        class="border-border text-ink-light min-w-0 border px-1.5 font-mono text-xs"
                      >
                        {tag}
                      </span>
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
      {#if data.unprocessed.total > 0}
        <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <p class="text-muted text-sm">
              Showing <span class="text-ink font-mono tabular-nums">
                {offset + 1}-{Math.min(offset + data.limit, data.unprocessed.total)}
              </span>
              of <span class="text-ink font-mono tabular-nums">{data.unprocessed.total}</span>
            </p>
            <Select
              ariaLabel="Results per page"
              value={String(data.limit)}
              options={PAGE_SIZE_OPTIONS}
              onchange={changePageSize}
            />
          </div>
          {#if totalPages > 1}
            <div class="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                icon={CaretLeftIcon}
                ariaLabel="Previous page"
                onclick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              />
              <span class="text-ink px-3 font-mono text-sm tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                icon={CaretRightIcon}
                ariaLabel="Next page"
                onclick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              />
            </div>
          {/if}
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
            <WarningCircleIcon class="text-ember h-5 w-5" />
            Failed results
          </h2>
          <p class="text-muted text-sm">
            {data.failed.total} result{data.failed.total === 1 ? '' : 's'} failed during processing.
          </p>
        </div>
        {#if data.failed.total > 0}
          <Button
            variant="outline"
            icon={ArrowsClockwiseIcon}
            onclick={handleRetryAllFailed}
            disabled={layoutCtx.isProcessing}
          >
            Retry all failed
          </Button>
        {/if}
      </div>

      <div class="border-border divide-border divide-y border-y">
        {#each data.failed.items as result (result.id)}
          <div
            class="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-ink truncate text-sm font-medium">{result.documentTitle}</p>
              <div class="space-y-1">
                {#if result.failureType === 'no_suggestions'}
                  <span class="status-word text-warn">
                    <span aria-hidden="true">◆</span> NO SUGGESTIONS
                  </span>
                  <p class="text-muted text-sm">AI could not suggest metadata for this document</p>
                {:else}
                  <span class="status-word text-ember">
                    <span aria-hidden="true">●</span> FAILED
                  </span>
                  {#if result.errorMessage}
                    <p class="text-muted line-clamp-3 text-sm">{result.errorMessage}</p>
                  {/if}
                {/if}
              </div>
            </div>
            {#if result.failureType === 'no_suggestions'}
              <Button
                variant="outline"
                size="sm"
                icon={XCircleIcon}
                class="shrink-0"
                onclick={() => handleDismissOne(result.id)}
                disabled={layoutCtx.isProcessing}
              >
                Dismiss
              </Button>
            {:else}
              <Button
                variant="outline"
                size="sm"
                icon={ArrowsClockwiseIcon}
                class="shrink-0"
                onclick={() => handleRetryOne(result.documentId)}
                disabled={layoutCtx.isProcessing}
              >
                Retry
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if data.skipped.items.length > 0}
    <section class="space-y-3">
      <div class="space-y-0.5">
        <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
          <WarningCircleIcon class="text-warn h-5 w-5" />
          Skipped documents
        </h2>
        <p class="text-muted text-sm">
          {data.skipped.total} document{data.skipped.total === 1 ? '' : 's'} skipped due to missing OCR
          text
        </p>
      </div>

      <div class="border-border divide-border divide-y border-y">
        {#each data.skipped.items as result (result.id)}
          <div
            class="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-ink truncate text-sm font-medium">{result.documentTitle}</p>
              <div class="space-y-1">
                <span class="status-word text-warn">
                  <span aria-hidden="true">◆</span> NO OCR TEXT
                </span>
                <p class="text-muted text-sm">
                  This document has no text content. Run OCR in Paperless-NGX, then re-sync and
                  retry.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={XCircleIcon}
              class="shrink-0"
              onclick={() => handleDismissOne(result.id)}
              disabled={layoutCtx.isProcessing}
            >
              Dismiss
            </Button>
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
