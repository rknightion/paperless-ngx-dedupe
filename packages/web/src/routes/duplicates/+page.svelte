<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { ConfidenceBadge, StatusBadge, ConfirmDialog } from '$lib/components';

  let { data } = $props();

  let selectedIds: Set<string> = $state(new Set());
  let isSubmitting = $state(false);
  let actionFeedback: { type: 'success' | 'error'; message: string } | null = $state(null);
  let showDeleteConfirm = $state(false);

  // Reset selection when data changes (e.g. after filter/pagination change)
  $effect(() => {
    void data.groups;
    selectedIds = new Set();
  });

  // Derived helpers
  let hasFilters = $derived(
    $page.url.searchParams.has('reviewed') ||
      $page.url.searchParams.has('resolved') ||
      $page.url.searchParams.has('minConfidence') ||
      $page.url.searchParams.has('maxConfidence'),
  );

  let allSelected = $derived(data.groups.length > 0 && selectedIds.size === data.groups.length);

  let currentStatus = $derived(() => {
    const reviewed = $page.url.searchParams.get('reviewed');
    const resolved = $page.url.searchParams.get('resolved');
    if (resolved === 'true') return 'resolved';
    if (reviewed === 'true') return 'reviewed';
    if (reviewed === 'false' && resolved === 'false') return 'unreviewed';
    return 'all';
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
    if (value === 'all') {
      applyFilters({ reviewed: '', resolved: '' });
    } else if (value === 'unreviewed') {
      applyFilters({ reviewed: 'false', resolved: 'false' });
    } else if (value === 'reviewed') {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const params = new URLSearchParams($page.url.searchParams);
      params.set('reviewed', 'true');
      params.delete('resolved');
      params.delete('offset');
      goto(`?${params.toString()}`, { replaceState: true });
    } else if (value === 'resolved') {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const params = new URLSearchParams($page.url.searchParams);
      params.set('resolved', 'true');
      params.delete('reviewed');
      params.delete('offset');
      goto(`?${params.toString()}`, { replaceState: true });
    }
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
  async function batchAction(url: string, body: Record<string, unknown>) {
    isSubmitting = true;
    actionFeedback = null;
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
      } else {
        actionFeedback = { type: 'error', message: json.error?.message ?? 'Action failed' };
      }
    } catch {
      actionFeedback = { type: 'error', message: 'Request failed' };
    }
    isSubmitting = false;
  }

  function markReviewed() {
    batchAction('/api/v1/batch/review', { groupIds: [...selectedIds] });
  }

  function resolveSelected() {
    batchAction('/api/v1/batch/resolve', { groupIds: [...selectedIds] });
  }

  function deleteNonPrimary() {
    showDeleteConfirm = false;
    batchAction('/api/v1/batch/delete-non-primary', { groupIds: [...selectedIds], confirm: true });
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
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-ink text-3xl font-bold">Duplicate Groups</h1>
      <span class="bg-accent-light text-accent rounded-full px-2.5 py-0.5 text-xs font-semibold">
        {data.total}
      </span>
    </div>
    <a
      href="/duplicates/wizard"
      class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
    >
      Bulk Operations Wizard
    </a>
  </div>

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
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        >
          <option value="all">All</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
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
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
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
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        />
      </div>

      <div>
        <label for="sort-by" class="text-ink block text-sm font-medium">Sort By</label>
        <div class="mt-1 flex gap-1">
          <select
            id="sort-by"
            onchange={handleSortChange}
            value={$page.url.searchParams.get('sortBy') ?? 'confidence'}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
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

  <!-- Bulk Actions Bar -->
  {#if selectedIds.size > 0}
    <div
      class="border-accent bg-accent-light flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
    >
      <span class="text-ink text-sm font-medium">{selectedIds.size} selected</span>
      <button
        onclick={markReviewed}
        disabled={isSubmitting}
        class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Mark Reviewed
      </button>
      <button
        onclick={resolveSelected}
        disabled={isSubmitting}
        class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Resolve Selected
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
            <th class="text-muted px-4 py-3 font-medium">Members</th>
            <th class="text-muted px-4 py-3 font-medium">Confidence</th>
            <th class="text-muted px-4 py-3 font-medium">Status</th>
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
              <td class="text-ink px-4 py-3">
                {group.memberCount}
              </td>
              <td class="px-4 py-3">
                <ConfidenceBadge score={group.confidenceScore} />
              </td>
              <td class="px-4 py-3">
                <StatusBadge
                  status={group.resolved ? 'resolved' : group.reviewed ? 'reviewed' : 'pending'}
                />
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
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
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
  message="This will permanently delete non-primary documents from the selected groups in Paperless-NGX. This action cannot be undone."
  confirmLabel="Delete"
  variant="ember"
  onconfirm={deleteNonPrimary}
  oncancel={() => (showDeleteConfirm = false)}
/>
