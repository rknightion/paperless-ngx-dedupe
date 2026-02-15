<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ConfidenceBadge,
    StatusBadge,
    ConfirmDialog,
    RichTooltip,
    ConfidenceTooltipContent,
    GroupPreviewModal,
    RecycleBinPrompt,
  } from '$lib/components';

  let { data } = $props();

  let selectedIds: Set<string> = $state(new Set());
  let isSubmitting = $state(false);
  let actionFeedback: { type: 'success' | 'error'; message: string } | null = $state(null);
  let showDeleteConfirm = $state(false);
  let showRecycleBinPrompt = $state(false);
  let previewGroupId: string | null = $state(null);
  let previewGroupTitle = $state('');
  let previewConfidenceScore = $state(0);

  function openPreview(group: (typeof data.groups)[0]) {
    previewGroupId = group.id;
    previewGroupTitle = group.primaryDocumentTitle ?? 'Untitled';
    previewConfidenceScore = group.confidenceScore;
  }

  function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  // Reset selection when data changes (e.g. after filter/pagination change)
  $effect(() => {
    void data.groups;
    selectedIds = new Set();
  });

  // Derived helpers
  let hasFilters = $derived(
    $page.url.searchParams.has('status') ||
      $page.url.searchParams.has('minConfidence') ||
      $page.url.searchParams.has('maxConfidence'),
  );

  let allSelected = $derived(data.groups.length > 0 && selectedIds.size === data.groups.length);

  let currentStatus = $derived(() => {
    return $page.url.searchParams.get('status') ?? 'all';
  });

  let showingFrom = $derived(data.offset + 1);
  let showingTo = $derived(Math.min(data.offset + data.limit, data.total));

  // Filter helpers
  function applyFilters(updates: Record<string, string>) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete('offset');
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function clearFilters() {
    goto('?', { replaceState: true });
  }

  function handleStatusChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    applyFilters({ status: value === 'all' ? '' : value });
  }

  function handleMinConfidence(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    applyFilters({ minConfidence: value ? String(Number(value) / 100) : '' });
  }

  function handleMaxConfidence(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    applyFilters({ maxConfidence: value ? String(Number(value) / 100) : '' });
  }

  function handleSortChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    applyFilters({ sortBy: value });
  }

  function toggleSortOrder() {
    const current = $page.url.searchParams.get('sortOrder') ?? 'desc';
    applyFilters({ sortOrder: current === 'desc' ? 'asc' : 'desc' });
  }

  // Selection helpers
  function toggleSelectAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(data.groups.map((g) => g.id));
    }
  }

  function toggleSelect(id: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  // Batch actions
  async function batchAction(url: string, body: Record<string, unknown>): Promise<boolean> {
    isSubmitting = true;
    actionFeedback = null;
    let success = false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        actionFeedback = { type: 'success', message: json.message ?? 'Action completed' };
        selectedIds = new Set();
        await invalidateAll();
        success = true;
      } else {
        actionFeedback = { type: 'error', message: json.error?.message ?? 'Action failed' };
      }
    } catch {
      actionFeedback = { type: 'error', message: 'Request failed' };
    }
    isSubmitting = false;
    return success;
  }

  function dismissSelected() {
    batchAction('/api/v1/batch/status', { groupIds: [...selectedIds], status: 'false_positive' });
  }

  function ignoreSelected() {
    batchAction('/api/v1/batch/status', { groupIds: [...selectedIds], status: 'ignored' });
  }

  async function deleteNonPrimary() {
    showDeleteConfirm = false;
    const success = await batchAction('/api/v1/batch/delete-non-primary', {
      groupIds: [...selectedIds],
      confirm: true,
    });
    if (success) {
      showRecycleBinPrompt = true;
    }
  }

  // Pagination
  function goToPage(newOffset: number) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', String(newOffset));
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function changePageSize(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('limit', value);
    params.delete('offset');
    goto(`?${params.toString()}`, { replaceState: true });
  }
</script>

<svelte:head>
  <title>Duplicates - Paperless Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-ink text-3xl font-bold">Duplicate Groups</h1>
      <span class="bg-accent-light text-accent rounded-full px-2.5 py-0.5 text-xs font-semibold">
        {data.total}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <a
        href="/duplicates/graph"
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Similarity Graph
      </a>
      <a
        href="/api/v1/export/duplicates.csv?{$page.url.searchParams.toString()}"
        download
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Export CSV
      </a>
      <a
        href="/duplicates/wizard"
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
      >
        Bulk Operations Wizard
      </a>
    </div>
  </div>

  <!-- How does this work? -->
  <details class="panel">
    <summary class="text-accent hover:text-accent-hover cursor-pointer text-sm font-medium">
      How does duplicate detection work?
    </summary>
    <div class="text-muted mt-3 space-y-3 text-sm leading-relaxed">
      <p>
        Paperless Dedupe identifies potential duplicates using a multi-stage pipeline that compares
        documents across four similarity dimensions:
      </p>
      <dl
        class="border-soft grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border p-3 text-xs"
      >
        <dt class="text-ink font-semibold">Jaccard (Shingles)</dt>
        <dd>
          Compares word sequences using compact MinHash signatures. Best for catching near-identical
          documents and OCR re-scans.
        </dd>
        <dt class="text-ink font-semibold">Fuzzy Text</dt>
        <dd>
          Measures character-level edit distance after sorting words. Catches documents with minor
          wording differences or typos.
        </dd>
        <dt class="text-ink font-semibold">Metadata</dt>
        <dd>
          Compares correspondent, document type, tags, and dates. Useful when OCR text varies but
          document metadata is consistent.
        </dd>
        <dt class="text-ink font-semibold">Filename</dt>
        <dd>
          Compares original filenames for structural similarity. Helps when files were uploaded
          multiple times with similar names.
        </dd>
      </dl>
      <p>
        These four scores are combined into an overall
        <strong class="text-ink">confidence score</strong>
        using configurable weights (adjustable in
        <a href="/settings" class="text-accent hover:text-accent-hover underline">Settings</a>).
        Hover over any confidence badge to see the breakdown.
      </p>
      <p>
        <strong class="text-ink">Workflow:</strong> Review groups by clicking a row to compare
        documents side-by-side. For each group, choose an outcome:
        <em>Not a Duplicate</em> (false positive),
        <em>Keep All</em> (real duplicates, but you want to keep every copy), or
        <em>Delete Duplicates</em> (remove non-primary documents via Paperless-NGX recycle bin).
        Groups can be reopened at any time. Use the
        <a href="/duplicates/wizard" class="text-accent hover:text-accent-hover underline">
          Bulk Operations Wizard
        </a>
        for batch processing.
      </p>
    </div>
  </details>

  <p class="text-muted text-sm">
    When documents are deleted through this app, Paperless-NGX moves them to its recycle bin rather
    than permanently deleting them.
  </p>

  <!-- Action Feedback -->
  {#if actionFeedback}
    <div
      class="rounded-lg px-3 py-2 text-sm {actionFeedback.type === 'success'
        ? 'bg-success-light text-success'
        : 'bg-ember-light text-ember'}"
    >
      {actionFeedback.message}
    </div>
  {/if}

  <!-- Filter Bar -->
  <div class="panel">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label for="status-filter" class="text-ink block text-sm font-medium">Status</label>
        <select
          id="status-filter"
          onchange={handleStatusChange}
          value={currentStatus()}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="false_positive">False Positive</option>
          <option value="ignored">Ignored</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div>
        <label for="min-confidence" class="text-ink block text-sm font-medium">Min Confidence</label
        >
        <input
          id="min-confidence"
          type="number"
          min="0"
          max="100"
          placeholder="0"
          value={$page.url.searchParams.get('minConfidence')
            ? Math.round(Number($page.url.searchParams.get('minConfidence')) * 100)
            : ''}
          onchange={handleMinConfidence}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-24 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>

      <div>
        <label for="max-confidence" class="text-ink block text-sm font-medium">Max Confidence</label
        >
        <input
          id="max-confidence"
          type="number"
          min="0"
          max="100"
          placeholder="100"
          value={$page.url.searchParams.get('maxConfidence')
            ? Math.round(Number($page.url.searchParams.get('maxConfidence')) * 100)
            : ''}
          onchange={handleMaxConfidence}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-24 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>

      <div>
        <label for="sort-by" class="text-ink block text-sm font-medium">Sort By</label>
        <div class="mt-1 flex gap-1">
          <select
            id="sort-by"
            onchange={handleSortChange}
            value={$page.url.searchParams.get('sortBy') ?? 'confidence'}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="confidence">Confidence</option>
            <option value="created_at">Created</option>
            <option value="member_count">Members</option>
          </select>
          <button
            onclick={toggleSortOrder}
            class="border-soft text-ink hover:bg-canvas rounded-lg border px-2 py-2 text-sm"
            title="Toggle sort order"
          >
            {($page.url.searchParams.get('sortOrder') ?? 'desc') === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Active Filter Chips -->
  {#if hasFilters}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-muted text-xs">Active filters:</span>
      {#if $page.url.searchParams.get('status')}
        <span
          class="bg-accent-light text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        >
          Status: {currentStatus()}
          <button
            onclick={() => applyFilters({ status: '' })}
            class="hover:text-accent-hover">&times;</button
          >
        </span>
      {/if}
      {#if $page.url.searchParams.get('minConfidence')}
        <span
          class="bg-accent-light text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        >
          Min: {Math.round(Number($page.url.searchParams.get('minConfidence')) * 100)}%
          <button
            onclick={() => applyFilters({ minConfidence: '' })}
            class="hover:text-accent-hover">&times;</button
          >
        </span>
      {/if}
      {#if $page.url.searchParams.get('maxConfidence')}
        <span
          class="bg-accent-light text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        >
          Max: {Math.round(Number($page.url.searchParams.get('maxConfidence')) * 100)}%
          <button
            onclick={() => applyFilters({ maxConfidence: '' })}
            class="hover:text-accent-hover">&times;</button
          >
        </span>
      {/if}
      <button onclick={clearFilters} class="text-muted hover:text-ink text-xs underline">
        Clear all
      </button>
    </div>
  {/if}

  <!-- Bulk Actions Bar -->
  {#if selectedIds.size > 0}
    <div
      class="border-accent bg-accent-light flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
    >
      <span class="text-ink text-sm font-medium">{selectedIds.size} selected</span>
      <button
        onclick={dismissSelected}
        disabled={isSubmitting}
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        Not Duplicates
      </button>
      <button
        onclick={ignoreSelected}
        disabled={isSubmitting}
        class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Keep All
      </button>
      <button
        onclick={() => (showDeleteConfirm = true)}
        disabled={isSubmitting}
        class="bg-ember rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        Delete Non-Primary
      </button>
      <button onclick={() => (selectedIds = new Set())} class="text-muted hover:text-ink text-sm">
        Clear selection
      </button>
    </div>
  {/if}

  <!-- Data Table -->
  {#if data.total > 0}
    <div class="border-soft overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-soft bg-canvas border-b text-left">
            <th class="px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onchange={toggleSelectAll}
                class="rounded"
              />
            </th>
            <th class="text-muted px-4 py-3 font-medium">Primary Doc Title</th>
            <th class="text-muted hidden px-4 py-3 font-medium md:table-cell">Members</th>
            <th class="text-muted px-4 py-3 font-medium">Confidence</th>
            <th class="text-muted hidden px-4 py-3 font-medium sm:table-cell">Status</th>
            <th class="text-muted hidden px-4 py-3 font-medium lg:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody>
          {#each data.groups as group, i (group.id)}
            <tr
              class="border-soft hover:bg-canvas cursor-pointer border-b {i % 2 === 0
                ? 'bg-surface'
                : 'bg-canvas'}"
              onclick={() => goto(`/duplicates/${group.id}`)}
            >
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(group.id)}
                  onchange={() => toggleSelect(group.id)}
                  onclick={(e) => e.stopPropagation()}
                  class="rounded"
                />
              </td>
              <td class="text-ink max-w-xs truncate px-4 py-3">
                {group.primaryDocumentTitle ?? 'Untitled'}
              </td>
              <td class="text-ink hidden px-4 py-3 md:table-cell">
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    openPreview(group);
                  }}
                  class="text-accent hover:text-accent-hover font-medium underline decoration-dotted underline-offset-2"
                  title="Preview members"
                >
                  {group.memberCount}
                </button>
              </td>
              <td class="px-4 py-3">
                <RichTooltip position="left">
                  <ConfidenceBadge score={group.confidenceScore} />
                  {#snippet content()}
                    <ConfidenceTooltipContent
                      jaccardSimilarity={group.jaccardSimilarity}
                      fuzzyTextRatio={group.fuzzyTextRatio}
                      metadataSimilarity={group.metadataSimilarity}
                      filenameSimilarity={group.filenameSimilarity}
                    />
                  {/snippet}
                </RichTooltip>
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <StatusBadge status={group.status} />
              </td>
              <td class="text-muted hidden px-4 py-3 text-xs lg:table-cell" title={group.updatedAt}>
                {timeAgo(group.updatedAt)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <span class="text-muted text-sm">
        Showing {showingFrom}-{showingTo} of {data.total}
      </span>
      <div class="flex items-center gap-3">
        <button
          onclick={() => goToPage(data.offset - data.limit)}
          disabled={data.offset === 0}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onclick={() => goToPage(data.offset + data.limit)}
          disabled={data.offset + data.limit >= data.total}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Next
        </button>
        <select
          onchange={changePageSize}
          value={String(data.limit)}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </div>
    </div>
  {:else if hasFilters}
    <!-- Empty state with filters -->
    <div class="panel py-12 text-center">
      <p class="text-muted">No groups match your filters.</p>
      <button
        onclick={clearFilters}
        class="bg-accent hover:bg-accent-hover mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
      >
        Clear filters
      </button>
    </div>
  {:else}
    <!-- Empty state, no data -->
    <div class="panel py-12 text-center">
      <p class="text-muted">No duplicates found yet. Run analysis from the Dashboard.</p>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Non-Primary Documents"
  message="This will delete non-primary documents from the selected groups in Paperless-NGX. Documents are moved to the Paperless-NGX recycle bin and can be restored from there."
  confirmLabel="Delete"
  variant="ember"
  onconfirm={deleteNonPrimary}
  oncancel={() => (showDeleteConfirm = false)}
/>

<!-- Recycle Bin Prompt Dialog -->
{#if showRecycleBinPrompt}
  <dialog
    open
    onclick={(e) => {
      if (e.target === e.currentTarget) showRecycleBinPrompt = false;
    }}
    class="border-soft bg-surface fixed inset-0 z-50 m-auto max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/40"
  >
    <h2 class="text-ink text-lg font-semibold">Delete Complete</h2>
    <RecycleBinPrompt onclose={() => (showRecycleBinPrompt = false)} />
  </dialog>
{/if}

<!-- Group Preview Modal -->
{#if previewGroupId}
  <GroupPreviewModal
    open={previewGroupId !== null}
    groupId={previewGroupId}
    groupTitle={previewGroupTitle}
    confidenceScore={previewConfidenceScore}
    paperlessUrl={data.paperlessUrl}
    onclose={() => {
      previewGroupId = null;
    }}
  />
{/if}
