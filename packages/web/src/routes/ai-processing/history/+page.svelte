<script lang="ts">
  import { untrack } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { addToast } from '$lib/components/ai/AiReviewStore.svelte';
  import AiApplyAuditCard from '$lib/components/ai/AiApplyAuditCard.svelte';
  import type { AiResultDetail } from '@paperless-dedupe/core';
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

  let { data } = $props();

  const initialSearch = untrack(() => data.search);

  // ── Filter state ──
  let localSearch = $state(initialSearch ?? '');

  // ── Detail drawer state ──
  let activeResultId = $state<string | null>(null);
  let activeResultDetail = $state<AiResultDetail | null>(null);
  let detailLoadState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  let isReverting = $state(false);
  let isRetryingApply = $state(false);

  // ── Derived ──
  const totalPages = $derived(Math.ceil(data.total / data.limit));
  const currentPage = $derived(Math.floor(data.offset / data.limit) + 1);

  const statusFilters = [
    { value: null, label: 'All' },
    { value: 'applied', label: 'Applied', icon: CircleCheck, colorClass: 'text-success' },
    { value: 'partial', label: 'Partial', icon: AlertCircle, colorClass: 'text-accent' },
    { value: 'rejected', label: 'Rejected', icon: CircleX, colorClass: 'text-muted' },
    { value: 'reverted', label: 'Reverted', icon: Undo2, colorClass: 'text-accent' },
    { value: 'failed', label: 'Failed', icon: AlertCircle, colorClass: 'text-ember' },
  ] as const;

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'applied':
        return 'bg-success-light text-success';
      case 'partial':
        return 'bg-accent-light text-accent';
      case 'rejected':
        return 'text-muted bg-canvas';
      case 'reverted':
        return 'bg-accent-light text-accent';
      case 'failed':
        return 'bg-ember-light text-ember';
      default:
        return 'bg-canvas text-muted';
    }
  }

  function statusDisplayText(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
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
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', String((p - 1) * data.limit));
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
</script>

<div class="space-y-4">
  <!-- Filters -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <!-- Status filter toggles -->
    <div class="flex flex-wrap items-center gap-1">
      {#each statusFilters as sf (sf.label)}
        {@const isActive = sf.value === data.status || (sf.value === null && !data.status)}
        <button
          onclick={() => handleStatusFilter(sf.value)}
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors {isActive
            ? 'bg-accent text-on-accent'
            : 'bg-canvas-alt text-muted hover:bg-canvas'}"
        >
          {sf.label}
        </button>
      {/each}
    </div>

    <!-- Search -->
    <div class="relative">
      <Search
        class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
      />
      <input
        type="text"
        bind:value={localSearch}
        placeholder="Search history..."
        onkeydown={handleSearchKeydown}
        class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent rounded-lg border py-2 pr-3 pl-8 text-sm focus:ring-1 focus:outline-none"
      />
    </div>

    <!-- Sort -->
    <select
      value={data.sort}
      onchange={(e) => applyFilters({ sort: (e.target as HTMLSelectElement).value })}
      class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
    >
      <option value="applied_newest">Newest Applied</option>
      <option value="applied_oldest">Oldest Applied</option>
      <option value="newest">Newest Created</option>
      <option value="oldest">Oldest Created</option>
    </select>
  </div>

  <!-- Results List -->
  <div class="flex gap-4">
    <div class="min-w-0 flex-1">
      {#if data.results.length === 0}
        <div class="panel flex flex-col items-center py-16 text-center">
          <div class="bg-canvas-alt mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <History class="text-muted h-7 w-7" />
          </div>
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
        <div class="panel overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-soft border-b text-left">
                <th class="text-muted p-3 text-xs font-medium tracking-wider uppercase">Title</th>
                <th
                  class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase sm:table-cell"
                  >Status</th
                >
                <th
                  class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase md:table-cell"
                  >Suggestion</th
                >
                <th
                  class="text-muted hidden p-3 text-xs font-medium tracking-wider uppercase lg:table-cell"
                  >Applied At</th
                >
              </tr>
            </thead>
            <tbody>
              {#each data.results as result (result.id)}
                {@const isActive = activeResultId === result.id}
                <tr
                  class="border-soft hover:bg-canvas cursor-pointer border-b transition-colors last:border-b-0 {isActive
                    ? 'bg-accent-light/30'
                    : ''}"
                  onclick={() => openDetail(result.id)}
                  onkeydown={(e) => e.key === 'Enter' && openDetail(result.id)}
                  tabindex="0"
                  role="button"
                >
                  <td class="p-3">
                    <div class="min-w-0">
                      <p class="text-ink truncate text-sm font-medium">{result.documentTitle}</p>
                      <p class="text-muted text-xs sm:hidden">
                        {statusDisplayText(result.appliedStatus)}
                      </p>
                    </div>
                  </td>
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
                  <td class="hidden p-3 md:table-cell">
                    <div class="text-muted space-y-0.5 text-xs">
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
                  <td class="hidden p-3 lg:table-cell">
                    <span class="text-muted text-xs">{formatDate(result.appliedAt)}</span>
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

    <!-- Detail Drawer -->
    {#if activeResultId}
      <aside
        class="panel sticky top-24 max-h-[calc(100vh-12rem)] w-[480px] shrink-0 overflow-y-auto"
      >
        {#if detailLoadState === 'loading'}
          <div class="space-y-4 p-4">
            <div class="flex items-center justify-between">
              <div class="bg-canvas-deep h-6 w-48 animate-pulse rounded"></div>
              <button
                onclick={closeDetail}
                class="text-muted hover:text-ink rounded-lg p-1.5 transition-colors"
                title="Close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
            <div class="bg-canvas-deep h-[200px] animate-pulse rounded-lg"></div>
            <div class="space-y-3">
              <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
              <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
            </div>
          </div>
        {:else if detailLoadState === 'error'}
          <div class="flex flex-col items-center justify-center gap-4 p-8">
            <div class="bg-ember-light flex h-12 w-12 items-center justify-center rounded-full">
              <AlertCircle class="text-ember h-6 w-6" />
            </div>
            <p class="text-ink text-sm font-medium">Failed to load result</p>
            <button
              onclick={() => activeResultId && openDetail(activeResultId)}
              class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              Retry
            </button>
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
                    class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
                      activeResultDetail.appliedStatus,
                    )}"
                  >
                    {statusDisplayText(activeResultDetail.appliedStatus)}
                  </span>
                  <a
                    href="{data.paperlessUrl}/documents/{activeResultDetail.paperlessId}/details"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent hover:text-accent-hover flex items-center gap-1 text-xs font-medium"
                  >
                    View in Paperless
                    <ExternalLink class="h-3 w-3" />
                  </a>
                </div>
              </div>
              <button
                onclick={closeDetail}
                class="text-muted hover:text-ink shrink-0 rounded-lg p-1.5 transition-colors"
                title="Close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

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
                <blockquote class="border-accent text-muted border-l-2 pl-3 text-sm italic">
                  {activeResultDetail.evidence}
                </blockquote>
              </div>
            {/if}

            <!-- Processing Info -->
            <div class="space-y-2">
              <h3 class="text-ink text-sm font-semibold">Processing Info</h3>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">Provider</dt>
                <dd class="text-ink font-medium">{activeResultDetail.provider}</dd>
                <dt class="text-muted">Model</dt>
                <dd class="text-ink font-medium">{activeResultDetail.model}</dd>
                <dt class="text-muted">Created At</dt>
                <dd class="text-ink font-medium">{formatDate(activeResultDetail.createdAt)}</dd>
              </dl>
            </div>
          </div>

          <!-- Revert Action Footer -->
          {#if (activeResultDetail.appliedStatus === 'applied' || activeResultDetail.appliedStatus === 'partial') && activeResultDetail.preApplyCorrespondentName !== null}
            <div class="border-soft bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
              <button
                onclick={() => activeResultDetail && handleRevert(activeResultDetail.id)}
                disabled={isReverting}
                class="border-ember text-ember hover:bg-ember-light flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {#if isReverting}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Reverting...
                {:else}
                  <Undo2 class="h-4 w-4" />
                  Revert Changes
                {/if}
              </button>
            </div>
          {/if}
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
        {/if}
      </aside>
    {/if}
  </div>
</div>
