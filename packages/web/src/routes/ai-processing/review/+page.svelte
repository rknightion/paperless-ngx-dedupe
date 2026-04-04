<script lang="ts">
  import { getContext } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { ProgressBar } from '$lib/components';
  import AiResultList from '$lib/components/ai/AiResultList.svelte';
  import AiFilterBar from '$lib/components/ai/AiFilterBar.svelte';
  import AiBulkActionBar from '$lib/components/ai/AiBulkActionBar.svelte';
  import AiResultDetailDrawer from '$lib/components/ai/AiResultDetailDrawer.svelte';
  import AiKeyboardHandler from '$lib/components/ai/AiKeyboardHandler.svelte';
  import AiPreflightDialog from '$lib/components/ai/AiPreflightDialog.svelte';
  import AiResultGroupedList from '$lib/components/ai/AiResultGroupedList.svelte';
  import AiReviewPresets from '$lib/components/ai/AiReviewPresets.svelte';
  import { trackAiResultAction, trackAiBulkAction } from '$lib/faro-events';
  import {
    selectedIds,
    getActiveResultId,
    closeDetail,
    pruneSelection,
    addToast,
    selectAllMatchingFilter,
    clearFilterSelection,
    getSelectionMode,
  } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import type { AiResultSummary, ApplyPreflightResult, AiStats } from '@paperless-dedupe/core';
  import { Loader2, ChevronLeft, ChevronRight } from 'lucide-svelte';

  let { data } = $props();

  interface AiLayoutContext {
    readonly isProcessing: boolean;
    readonly stats: AiStats;
    startProcessing: (reprocess?: boolean) => Promise<void>;
    startProcessingWithScope: (scope: Record<string, unknown>, label: string) => Promise<void>;
    cancelCurrentJob: () => Promise<void>;
  }

  const layoutCtx = getContext<AiLayoutContext>('ai-layout');

  // ── Bulk Apply State ──
  let showPreflight = $state(false);
  let preflightData = $state<ApplyPreflightResult | null>(null);
  let preflightLoading = $state(false);
  let _applyJobId = $state<string | null>(null);
  let applyProgress = $state(0);
  let applyMessage = $state('');
  let isApplying = $state(false);
  let applySseConnection: ReturnType<typeof connectJobSSE> | null = null;
  let pendingApplyScope = $state<Record<string, unknown> | null>(null);

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
  const stats = $derived(layoutCtx.stats);
  const activeResultId = $derived(getActiveResultId());
  const totalPages = $derived(Math.ceil(data.total / data.limit));
  const currentPage = $derived(Math.floor(data.offset / data.limit) + 1);
  const selectionMode = $derived(getSelectionMode());
  // ── Selection Preservation ──
  $effect(() => {
    const currentIds = new Set(results.map((r: AiResultSummary) => r.id));
    pruneSelection(currentIds);
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      applySseConnection?.close();
    };
  });

  // ── Action Handlers ──

  async function handleApply(
    id: string,
    fields: string[],
    options: { allowClearing: boolean; createMissingEntities: boolean },
  ) {
    trackAiResultAction('apply', { resultId: id, fieldsApplied: fields });
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
    trackAiResultAction('reject', { resultId: id });
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
    const enabled = data.extractEnabled;
    const fields: string[] = [];
    if (result.suggestedTitle && enabled.title) fields.push('title');
    if (result.suggestedCorrespondent && enabled.correspondent) fields.push('correspondent');
    if (result.suggestedDocumentType && enabled.documentType) fields.push('documentType');
    if (result.suggestedTags.length > 0 && enabled.tags) fields.push('tags');
    if (fields.length === 0) {
      const allEnabled = ['title', 'correspondent', 'documentType', 'tags'].filter(
        (f) => enabled[f as keyof typeof enabled],
      );
      fields.push(...allEnabled);
    }
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
    const mode = getSelectionMode();
    trackAiBulkAction({
      action: 'apply',
      scope: mode.type === 'all_matching_filter' ? 'all_matching' : 'selected',
      count: mode.type === 'all_matching_filter' ? 0 : selectedIds.size,
    });
    await runPreflight(scope);
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
    goto(`/ai-processing/review?${params.toString()}`);
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
    goto(`/ai-processing/review?${params.toString()}`);
  }

  function changePageSize(e: Event) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('limit', (e.target as HTMLSelectElement).value);
    params.set('offset', '0');
    goto(`/ai-processing/review?${params.toString()}`);
  }

  const currentFilters = $derived({
    status: data.status ?? '',
    search: data.search ?? '',
    sort: data.sort ?? '',
    changedOnly: data.changedOnly ? 'true' : '',
    failed: data.failed ? 'true' : '',
    minConfidence: data.minConfidence ? String(data.minConfidence) : '',
    model: data.model ?? '',
  });
</script>

<!-- Review Presets -->
<AiReviewPresets {currentFilters} />

<!-- Filter Bar -->
<AiFilterBar
  status={data.status}
  search={data.search}
  sort={data.sort}
  groupBy={data.groupBy ?? undefined}
  changedOnly={data.changedOnly}
  failed={data.failed}
  minConfidence={data.minConfidence}
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
    {#if data.total > 0}
      <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <p class="text-muted text-sm">
            Showing <span class="text-ink font-medium"
              >{data.offset + 1}&ndash;{Math.min(data.offset + data.limit, data.total)}</span
            >
            of <span class="text-ink font-medium">{data.total}</span>
          </p>
          <select
            value={data.limit}
            onchange={changePageSize}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-2 py-1 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
        </div>
        {#if totalPages > 1}
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
        {/if}
      </div>
    {/if}
  </div>

  <!-- Desktop Detail Drawer -->
  {#if activeResultId && !isMobile}
    <AiResultDetailDrawer
      paperlessUrl={data.paperlessUrl}
      extractEnabled={data.extractEnabled}
      onapply={handleApply}
      onreject={handleReject}
      onclose={closeDetail}
    />
  {/if}
</div>

<!-- Mobile Detail Drawer -->
{#if activeResultId && isMobile}
  <AiResultDetailDrawer
    mobile
    paperlessUrl={data.paperlessUrl}
    extractEnabled={data.extractEnabled}
    onapply={handleApply}
    onreject={handleReject}
    onclose={closeDetail}
  />
{/if}

<!-- Overlays -->
<AiKeyboardHandler
  {results}
  onapply={handleApplySimple}
  onreject={handleReject}
  searchInputRef={null}
/>
<AiPreflightDialog
  open={showPreflight}
  preflight={preflightData}
  loading={preflightLoading}
  onconfirm={handlePreflightConfirm}
  oncancel={handlePreflightCancel}
/>
