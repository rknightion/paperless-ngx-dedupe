<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { connectJobSSE } from '$lib/sse';
  import { ConfirmDialog, GroupPreviewModal, RecycleBinPrompt } from '$lib/components';
  import BulkDeletePreview from '$lib/components/duplicates/BulkDeletePreview.svelte';
  import DuplicateInboxFilters from '$lib/components/duplicates/DuplicateInboxFilters.svelte';
  import DuplicateInboxList from '$lib/components/duplicates/DuplicateInboxList.svelte';
  import { trackCsvExported, trackDuplicatesBulkAction, trackPurgeDeleted } from '$lib/faro-events';
  import { Download, Network, Trash2, Wand2 } from 'lucide-svelte';

  let { data } = $props();
  let selectedIds = $state<Set<string>>(new Set());
  let isSubmitting = $state(false);
  let actionFeedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let showDeletePreview = $state(false);
  let showPurgeConfirm = $state(false);
  let showRecycleBinPrompt = $state(false);
  let deleteProgress = $state<{ progress: number; message: string } | null>(null);
  let previewGroup = $state<{
    id: string;
    primaryDocumentTitle: string | null;
    confidenceScore: number;
  } | null>(null);

  $effect(() => {
    void data.groups;
    selectedIds = new Set();
    showDeletePreview = false;
  });

  async function batchStatus(status: 'false_positive' | 'ignored') {
    isSubmitting = true;
    actionFeedback = null;
    trackDuplicatesBulkAction(status, selectedIds.size);
    try {
      const response = await fetch('/api/v1/batch/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: [...selectedIds], status }),
      });
      const body = await response.json();
      if (!response.ok) {
        actionFeedback = { type: 'error', message: body.error?.message ?? 'Action failed' };
        return;
      }
      actionFeedback = { type: 'success', message: body.message ?? 'Action completed' };
      selectedIds = new Set();
      await invalidateAll();
    } catch {
      actionFeedback = { type: 'error', message: 'Request failed' };
    } finally {
      isSubmitting = false;
    }
  }

  function deletionSubmitted(jobId?: string) {
    showDeletePreview = false;
    trackDuplicatesBulkAction('delete', selectedIds.size);
    if (!jobId) {
      isSubmitting = false;
      actionFeedback = { type: 'success', message: 'Reviewed deletion submitted.' };
      return;
    }
    isSubmitting = true;
    deleteProgress = { progress: 0, message: 'Starting reviewed deletion…' };
    connectJobSSE(jobId, {
      onProgress: (event) => {
        deleteProgress = { progress: event.progress, message: event.message ?? '' };
      },
      onComplete: async () => {
        deleteProgress = null;
        isSubmitting = false;
        selectedIds = new Set();
        await invalidateAll();
        showRecycleBinPrompt = true;
      },
      onError: () => {
        deleteProgress = null;
        isSubmitting = false;
        actionFeedback = { type: 'error', message: 'Reviewed deletion failed.' };
      },
    });
  }

  async function purgeDeleted() {
    showPurgeConfirm = false;
    isSubmitting = true;
    actionFeedback = null;
    try {
      const response = await fetch('/api/v1/batch/purge-deleted', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        actionFeedback = { type: 'error', message: body.error?.message ?? 'Purge failed' };
        return;
      }
      trackPurgeDeleted(body.data.purged);
      actionFeedback = {
        type: 'success',
        message: `Purged ${body.data.purged} deleted group(s) from the database.`,
      };
      await invalidateAll();
    } catch {
      actionFeedback = { type: 'error', message: 'Request failed' };
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Duplicates - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-5">
  <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-ink text-2xl font-semibold tracking-tight">Duplicate Groups</h1>
      <span class="bg-accent-light text-accent rounded-full px-2.5 py-0.5 text-xs font-semibold">
        {data.total}
      </span>
    </div>
    <div class="grid grid-cols-2 gap-2 sm:flex">
      <a
        href="/duplicates/graph"
        class="border-soft text-ink flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
      >
        <Network class="h-4 w-4" /> Similarity Graph
      </a>
      <a
        href="/api/v1/export/duplicates.csv?{$page.url.searchParams.toString()}"
        download
        onclick={() => trackCsvExported()}
        class="border-soft text-ink flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
      >
        <Download class="h-4 w-4" /> Export CSV
      </a>
      <a
        href="/duplicates/wizard"
        class="bg-accent flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
      >
        <Wand2 class="h-4 w-4" /> Bulk Operations Wizard
      </a>
      {#if data.deletedGroupCount > 0}
        <button
          type="button"
          onclick={() => (showPurgeConfirm = true)}
          disabled={isSubmitting}
          class="border-soft text-ember flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        >
          <Trash2 class="h-4 w-4" /> Purge {data.deletedGroupCount} Deleted
        </button>
      {/if}
    </div>
  </header>

  <p class="text-muted text-sm">
    Review likely matches before acting. Paperless-NGX deletions go to its recycle bin and are not
    permanently removed by this workflow.
  </p>

  {#if actionFeedback}
    <div
      role={actionFeedback.type === 'error' ? 'alert' : 'status'}
      class="rounded-lg px-3 py-2 text-sm {actionFeedback.type === 'success'
        ? 'bg-success-light text-success'
        : 'bg-ember-light text-ember'}"
    >
      {actionFeedback.message}
    </div>
  {/if}

  <DuplicateInboxFilters
    paginationMode={data.paginationMode}
    queue={data.query?.queue ?? 'pending'}
  />

  {#if selectedIds.size > 0}
    <section
      class="border-accent bg-accent-light sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
      aria-label="Bulk actions"
    >
      <span class="text-ink text-sm font-medium">{selectedIds.size} selected</span>
      <button
        type="button"
        onclick={() => batchStatus('false_positive')}
        disabled={isSubmitting}
        class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm font-medium"
      >
        Not Duplicates
      </button>
      <button
        type="button"
        onclick={() => batchStatus('ignored')}
        disabled={isSubmitting}
        class="bg-accent rounded-lg px-3 py-1.5 text-sm font-medium text-white"
      >
        Keep All
      </button>
      <button
        type="button"
        onclick={() => (showDeletePreview = true)}
        disabled={isSubmitting}
        class="bg-ember rounded-lg px-3 py-1.5 text-sm font-medium text-white"
      >
        Delete Non-Primary
      </button>
      <button
        type="button"
        onclick={() => (selectedIds = new Set())}
        class="text-muted text-sm underline"
      >
        Clear selection
      </button>
      {#if deleteProgress}
        <span class="text-muted text-sm" role="status">
          {deleteProgress.message || `${Math.round(deleteProgress.progress * 100)}%`}
        </span>
      {/if}
    </section>
  {/if}

  <DuplicateInboxList
    groups={data.groups}
    total={data.total}
    limit={data.limit}
    offset={data.offset}
    paginationMode={data.paginationMode}
    nextCursor={data.nextCursor}
    {selectedIds}
    onselectionchange={(ids) => (selectedIds = ids)}
    onpreview={(group) => (previewGroup = group)}
  />
</div>

<BulkDeletePreview
  open={showDeletePreview}
  groupIds={[...selectedIds]}
  oncancel={() => (showDeletePreview = false)}
  onsubmitted={deletionSubmitted}
/>

<ConfirmDialog
  open={showPurgeConfirm}
  title="Purge Deleted Groups"
  message="This permanently removes {data.deletedGroupCount} deleted group records from this app. Paperless-NGX documents are not affected."
  confirmLabel="Purge"
  variant="ember"
  onconfirm={purgeDeleted}
  oncancel={() => (showPurgeConfirm = false)}
/>

{#if showRecycleBinPrompt}
  <dialog
    open
    aria-labelledby="delete-complete-title"
    class="border-soft bg-surface fixed inset-0 z-50 m-auto max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/40"
  >
    <h2 id="delete-complete-title" class="text-ink text-lg font-semibold">Delete complete</h2>
    <RecycleBinPrompt onclose={() => (showRecycleBinPrompt = false)} />
  </dialog>
{/if}

{#if previewGroup}
  <GroupPreviewModal
    open
    groupId={previewGroup.id}
    groupTitle={previewGroup.primaryDocumentTitle ?? 'Untitled'}
    confidenceScore={previewGroup.confidenceScore}
    paperlessUrl={data.paperlessUrl}
    onclose={() => (previewGroup = null)}
  />
{/if}
