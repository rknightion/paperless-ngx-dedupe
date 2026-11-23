<script lang="ts">
  import { untrack } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Button, Select, SearchInput } from '$lib/components';
  import { addToast } from '$lib/components/ai/AiReviewStore.svelte';
  import { aiStatusWord } from '$lib/components/ai/ai-status';
  import AiApplyAuditCard from '$lib/components/ai/AiApplyAuditCard.svelte';
  import type { AiResultDetail } from '@paperless-dedupe/core';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';

  let { data } = $props();

  const SORT_OPTIONS = [
    { value: 'applied_newest', label: 'Newest applied' },
    { value: 'applied_oldest', label: 'Oldest applied' },
    { value: 'newest', label: 'Newest created' },
    { value: 'oldest', label: 'Oldest created' },
  ];
  const PAGE_SIZE_OPTIONS = [
    { value: '20', label: '20 / page' },
    { value: '50', label: '50 / page' },
    { value: '100', label: '100 / page' },
  ];
  const readOnly = $derived(data.readOnly === true);

  const initialSearch = untrack(() => data.search);

  // ── Filter state ──
  let localSearch = $state(initialSearch ?? '');

  // ── Detail drawer state ──
  let activeResultId = $state<string | null>(null);
  let activeResultDetail = $state<AiResultDetail | null>(null);
  let detailLoadState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  let isReverting = $state(false);
  let isRetryingApply = $state(false);
  let isRetryingExtraction = $state(false);

  // ── Derived ──
  const totalPages = $derived(Math.ceil(data.total / data.limit));
  const currentPage = $derived(Math.floor(data.offset / data.limit) + 1);

  const statusFilters = [
    { value: null, label: 'All' },
    { value: 'applied', label: 'Applied', icon: CheckCircleIcon, colorClass: 'text-success' },
    { value: 'partial', label: 'Partial', icon: WarningCircleIcon, colorClass: 'text-accent' },
    { value: 'rejected', label: 'Rejected', icon: XCircleIcon, colorClass: 'text-muted' },
    { value: 'reverted', label: 'Reverted', icon: ArrowUUpLeftIcon, colorClass: 'text-accent' },
    { value: 'failed', label: 'Failed', icon: WarningCircleIcon, colorClass: 'text-ember' },
    { value: 'skipped', label: 'Skipped', icon: WarningCircleIcon, colorClass: 'text-warn' },
  ] as const;

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  }

  function isExtractionFailure(result: AiResultDetail): boolean {
    if (result.appliedStatus !== 'failed') return false;
    return (
      !result.suggestedTitle &&
      !result.suggestedCorrespondent &&
      !result.suggestedDocumentType &&
      result.suggestedTags.length === 0
    );
  }

  // ── Navigation ──
  function applyFilters(overrides: Record<string, string | null> = {}) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams();
    const status = 'status' in overrides ? overrides.status : data.status;
    const search = 'search' in overrides ? overrides.search : data.search;
    const sort = 'sort' in overrides ? overrides.sort : data.sort;
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (sort && sort !== 'applied_newest') params.set('sort', sort);
    goto(`/ai-processing/history?${params.toString()}`);
  }

  function handleStatusFilter(value: string | null) {
    applyFilters({ status: value });
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      applyFilters({ search: localSearch || null });
    }
  }

  function goToPage(p: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('offset', String((p - 1) * data.limit));
    goto(`/ai-processing/history?${params.toString()}`);
  }

  function changePageSize(value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('limit', value);
    params.set('offset', '0');
    goto(`/ai-processing/history?${params.toString()}`);
  }

  // ── Detail Loading ──
  async function openDetail(id: string) {
    activeResultId = id;
    detailLoadState = 'loading';
    activeResultDetail = null;
    try {
      const res = await fetch(`/api/v1/ai/results/${id}`);
      if (!res.ok) throw new Error('Failed to load result');
      const json = await res.json();
      if (activeResultId === id) {
        activeResultDetail = json.data;
        detailLoadState = 'loaded';
      }
    } catch {
      if (activeResultId === id) {
        detailLoadState = 'error';
      }
    }
  }

  function closeDetail() {
    activeResultId = null;
    activeResultDetail = null;
    detailLoadState = 'idle';
  }

  // ── Revert Handler ──
  async function handleRevert(id: string) {
    if (readOnly) return;
    isReverting = true;
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/revert`, { method: 'POST' });
      if (res.ok) {
        addToast('success', 'Result reverted successfully');
        closeDetail();
        invalidateAll();
      } else {
        const json = await res.json();
        addToast('error', json.error?.message ?? 'Failed to revert result');
      }
    } catch {
      addToast('error', 'Failed to revert result');
    } finally {
      isReverting = false;
    }
  }

  async function handleRetryApply(id: string) {
    if (readOnly) return;
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

  async function handleRetryExtraction(id: string) {
    isRetryingExtraction = true;
    try {
      const res = await fetch(`/api/v1/ai/results/${id}/reprocess`, { method: 'POST' });
      if (res.ok) {
        addToast('success', 'Extraction retried successfully');
        closeDetail();
        invalidateAll();
      } else if (res.status === 409) {
        addToast('error', 'Revert this result before reprocessing it');
      } else {
        const json = await res.json();
        addToast('error', json.error?.message ?? 'Retry extraction failed');
      }
    } catch {
      addToast('error', 'Retry extraction failed');
    } finally {
      isRetryingExtraction = false;
    }
  }
</script>

<div class="space-y-4">
  <!-- Filters -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <!-- Status filter toggles -->
    <div
      class="border-border bg-surface flex flex-wrap items-center overflow-hidden rounded-sm border"
    >
      {#each statusFilters as sf (sf.label)}
        {@const isActive = sf.value === data.status || (sf.value === null && !data.status)}
        <!-- Segmented filter: one bordered group, selected fill on the active segment. -->
        <button
          onclick={() => handleStatusFilter(sf.value)}
          aria-pressed={isActive}
          class="border-border h-[26px] border-l px-3 text-sm transition-colors first:border-l-0 {isActive
            ? 'bg-selected text-ink font-medium'
            : 'text-muted hover:bg-canvas-deep'}"
        >
          {sf.label}
        </button>
      {/each}
    </div>

    <!-- Search -->
    <SearchInput
      bind:value={localSearch}
      placeholder="Search history..."
      ariaLabel="Search history"
      onkeydown={handleSearchKeydown}
    />

    <!-- Sort -->
    <Select
      ariaLabel="Sort history"
      value={data.sort}
      options={SORT_OPTIONS}
      onchange={(value) => applyFilters({ sort: value })}
    />
  </div>

  <!-- Results List -->
  <div class="flex gap-4">
    <div class="min-w-0 flex-1">
      {#if data.results.length === 0}
        <div class="flex flex-col items-center py-16 text-center">
          <p class="text-ink text-sm font-medium">No history found</p>
          <p class="text-muted mt-1 text-sm">
            {#if data.status || data.search}
              No results match your current filters. Try changing the status filter or search term.
            {:else}
              Applied, rejected, and reverted results will appear here.
            {/if}
          </p>
        </div>
      {:else}
        <div class="border-border border-y">
          <table class="w-full border-collapse [overflow-wrap:anywhere]">
            <thead>
              <tr class="text-left">
                <th
                  class="label-micro bg-surface border-border-hover sticky top-0 z-10 border-b px-3 py-1.5 pl-6 text-left"
                >
                  Title
                </th>
                <th
                  class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 text-left sm:table-cell"
                >
                  Status
                </th>
                <th
                  class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 text-left md:table-cell"
                >
                  Suggestion
                </th>
                <th
                  class="label-micro bg-surface border-border-hover sticky top-0 z-10 hidden border-b px-3 py-1.5 pr-6 text-left lg:table-cell"
                >
                  Applied at
                </th>
              </tr>
            </thead>
            <tbody>
              {#each data.results as result (result.id)}
                {@const isActive = activeResultId === result.id}
                <tr
                  class="border-border cursor-pointer border-b transition-colors {isActive
                    ? 'bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
                    : 'hover:bg-canvas-deep'}"
                  onclick={() => openDetail(result.id)}
                  onkeydown={(e) => e.key === 'Enter' && openDetail(result.id)}
                  tabindex="0"
                  role="button"
                >
                  <td class="py-2 pr-3 pl-6">
                    <div class="min-w-0">
                      <p class="text-ink line-clamp-2 text-base font-medium">
                        {result.documentTitle}
                      </p>
                      <p
                        class="status-word {aiStatusWord(result.appliedStatus)
                          .colorClass} sm:hidden"
                      >
                        <span aria-hidden="true">{aiStatusWord(result.appliedStatus).shape}</span>
                        <span class="uppercase">{aiStatusWord(result.appliedStatus).label}</span>
                      </p>
                    </div>
                  </td>
                  <td class="hidden px-3 py-2 sm:table-cell">
                    <div class="space-y-1">
                      <span class="status-word {aiStatusWord(result.appliedStatus).colorClass}">
                        <span aria-hidden="true">{aiStatusWord(result.appliedStatus).shape}</span>
                        <span class="uppercase">{aiStatusWord(result.appliedStatus).label}</span>
                      </span>
                      {#if result.appliedStatus === 'failed' && result.errorMessage}
                        <p class="text-muted line-clamp-2 text-sm">{result.errorMessage}</p>
                      {/if}
                    </div>
                  </td>
                  <td class="hidden px-3 py-2 md:table-cell">
                    <div class="text-muted space-y-0.5 text-sm">
                      {#if result.suggestedCorrespondent}
                        <p>Correspondent: {result.suggestedCorrespondent}</p>
                      {/if}
                      {#if result.suggestedDocumentType}
                        <p>Type: {result.suggestedDocumentType}</p>
                      {/if}
                      {#if result.suggestedTags.length > 0}
                        <p>Tags: {result.suggestedTags.join(', ')}</p>
                      {/if}
                    </div>
                  </td>
                  <td class="hidden py-2 pr-6 pl-3 lg:table-cell">
                    <span class="text-muted font-mono text-xs">{formatDate(result.appliedAt)}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if data.total > 0}
          <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <p class="text-muted text-sm">
                Showing <span class="text-ink font-mono tabular-nums">
                  {data.offset + 1}-{Math.min(data.offset + data.limit, data.total)}
                </span>
                of <span class="text-ink font-mono tabular-nums">{data.total}</span>
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
    </div>

    <!-- Detail Drawer -->
    {#if activeResultId}
      <aside
        class="border-border bg-canvas sticky top-4 max-h-[calc(100vh-8rem)] w-[380px] shrink-0 overflow-y-auto border-l"
      >
        {#if detailLoadState === 'loading'}
          <div class="space-y-4 p-4">
            <div class="flex items-center justify-between">
              <div class="bg-canvas-deep h-6 w-48 animate-pulse rounded"></div>
              <Button
                variant="ghost"
                size="sm"
                icon={XIcon}
                ariaLabel="Close"
                title="Close"
                onclick={closeDetail}
              />
            </div>
            <div class="bg-canvas-deep h-[200px] animate-pulse rounded-lg"></div>
            <div class="space-y-3">
              <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
              <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
            </div>
          </div>
        {:else if detailLoadState === 'error'}
          <div class="flex flex-col items-center justify-center gap-3 p-8">
            <span class="status-word text-ember"><span aria-hidden="true">●</span> FAIL</span>
            <p class="text-ink text-sm font-semibold">Failed to load result</p>
            <Button variant="outline" onclick={() => activeResultId && openDetail(activeResultId)}>
              Retry
            </Button>
          </div>
        {:else if activeResultDetail}
          <div class="space-y-5 p-4">
            <!-- Header -->
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1 space-y-1.5">
                <h2 class="text-ink text-lg leading-tight font-semibold break-words">
                  {activeResultDetail.documentTitle}
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="status-word {aiStatusWord(activeResultDetail.appliedStatus).colorClass}"
                  >
                    <span aria-hidden="true">
                      {aiStatusWord(activeResultDetail.appliedStatus).shape}
                    </span>
                    <span class="uppercase">
                      {aiStatusWord(activeResultDetail.appliedStatus).label}
                    </span>
                  </span>
                  <a
                    href="{data.paperlessUrl}/documents/{activeResultDetail.paperlessId}/details"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent hover:text-accent-hover flex items-center gap-1 text-xs font-medium"
                  >
                    View in Paperless
                    <ArrowSquareOutIcon class="h-3 w-3" />
                  </a>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={XIcon}
                ariaLabel="Close"
                title="Close"
                class="shrink-0"
                onclick={closeDetail}
              />
            </div>

            <!-- Error Banner -->
            {#if activeResultDetail.appliedStatus === 'failed' && activeResultDetail.errorMessage}
              <div class="border-ember bg-ember-light space-y-2 border p-3">
                <div class="flex items-start gap-2">
                  <span class="status-word text-ember mt-0.5">
                    <span aria-hidden="true">●</span> FAIL
                  </span>
                  <div class="min-w-0 space-y-1">
                    <p class="text-ink text-sm font-semibold">
                      {isExtractionFailure(activeResultDetail)
                        ? 'Extraction Failed'
                        : 'Apply Failed'}
                    </p>
                    {#if activeResultDetail.failureType}
                      <span class="border-ember text-ember border px-1.5 font-mono text-xs">
                        {activeResultDetail.failureType}
                      </span>
                    {/if}
                  </div>
                </div>
                <pre
                  class="text-ink bg-canvas border-border border p-3 font-mono text-xs whitespace-pre-wrap">{activeResultDetail.errorMessage}</pre>
              </div>
            {/if}

            <!-- Suggestions Summary -->
            <div class="space-y-2">
              <h3 class="text-ink text-sm font-semibold">AI Suggestions</h3>
              <dl class="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt class="text-muted">Correspondent</dt>
                <dd class="text-ink font-medium">
                  {activeResultDetail.suggestedCorrespondent ?? '--'}
                </dd>
                <dt class="text-muted">Document Type</dt>
                <dd class="text-ink font-medium">
                  {activeResultDetail.suggestedDocumentType ?? '--'}
                </dd>
                <dt class="text-muted">Tags</dt>
                <dd class="text-ink font-medium">
                  {activeResultDetail.suggestedTags.length > 0
                    ? activeResultDetail.suggestedTags.join(', ')
                    : '--'}
                </dd>
              </dl>
            </div>

            <!-- Audit Card -->
            {#if activeResultDetail.appliedStatus === 'applied' || activeResultDetail.appliedStatus === 'partial' || activeResultDetail.appliedStatus === 'reverted'}
              <AiApplyAuditCard result={activeResultDetail} />
            {/if}

            <!-- Evidence -->
            {#if activeResultDetail.evidence}
              <div class="space-y-2">
                <h3 class="text-ink text-sm font-semibold">Evidence</h3>
                <blockquote class="border-border-hover text-muted border-l-2 pl-3 text-sm">
                  {activeResultDetail.evidence}
                </blockquote>
              </div>
            {/if}

            <!-- Processing Info -->
            <div class="space-y-2">
              <h3 class="text-ink text-sm font-semibold">Processing Info</h3>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">Provider</dt>
                <dd class="text-ink font-mono">{activeResultDetail.provider}</dd>
                <dt class="text-muted">Model</dt>
                <dd class="text-ink font-mono">{activeResultDetail.model}</dd>
                <dt class="text-muted">Created At</dt>
                <dd class="text-ink font-mono">{formatDate(activeResultDetail.createdAt)}</dd>
              </dl>
            </div>
          </div>

          <!-- Revert Action Footer -->
          {#if (activeResultDetail.appliedStatus === 'applied' || activeResultDetail.appliedStatus === 'partial') && activeResultDetail.preApplyCorrespondentName !== null}
            <div class="border-border bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
              <Button
                variant="outline"
                fullWidth
                icon={ArrowUUpLeftIcon}
                loading={isReverting}
                disabled={readOnly}
                title={readOnly ? 'Paperless is read-only' : undefined}
                onclick={() => activeResultDetail && handleRevert(activeResultDetail.id)}
              >
                {isReverting ? 'Reverting...' : 'Revert changes'}
              </Button>
            </div>
          {/if}
          {#if activeResultDetail.appliedStatus === 'failed'}
            <div class="border-border bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
              {#if isExtractionFailure(activeResultDetail)}
                <Button
                  fullWidth
                  icon={ArrowsClockwiseIcon}
                  loading={isRetryingExtraction}
                  onclick={() => activeResultDetail && handleRetryExtraction(activeResultDetail.id)}
                >
                  {isRetryingExtraction ? 'Retrying Extraction...' : 'Retry Extraction'}
                </Button>
              {:else}
                <Button
                  fullWidth
                  icon={ArrowsClockwiseIcon}
                  loading={isRetryingApply}
                  disabled={readOnly}
                  title={readOnly ? 'Paperless is read-only' : undefined}
                  onclick={() => activeResultDetail && handleRetryApply(activeResultDetail.id)}
                >
                  {isRetryingApply ? 'Retrying...' : 'Retry Apply'}
                </Button>
              {/if}
            </div>
          {/if}
        {/if}
      </aside>
    {/if}
  </div>
</div>
