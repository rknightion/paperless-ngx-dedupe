<script lang="ts">
  import { ConfirmDialog } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';

  interface Props {
    groupId: string;
    reviewed: boolean;
    resolved: boolean;
    memberCount: number;
    onaction?: () => void;
  }

  let { groupId, reviewed, resolved, memberCount, onaction }: Props = $props();

  let isUpdating = $state(false);
  let error = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let deleteProgress = $state<{ progress: number; message: string } | null>(null);

  async function toggleReview() {
    isUpdating = true;
    error = null;
    try {
      const res = await fetch(`/api/v1/duplicates/${groupId}/review`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to update review status');
      onaction?.();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isUpdating = false;
    }
  }

  async function markResolved() {
    isUpdating = true;
    error = null;
    try {
      const res = await fetch(`/api/v1/duplicates/${groupId}/resolve`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to resolve group');
      onaction?.();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isUpdating = false;
    }
  }

  async function deleteNonPrimary() {
    showDeleteConfirm = false;
    isUpdating = true;
    error = null;
    try {
      const res = await fetch('/api/v1/batch/delete-non-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: [groupId], confirm: true }),
      });
      if (!res.ok) throw new Error('Failed to start delete operation');

      const json = await res.json();
      const jobId = json.data?.jobId;
      if (jobId) {
        deleteProgress = { progress: 0, message: 'Starting...' };
        connectJobSSE(jobId, {
          onProgress: (data) => {
            deleteProgress = { progress: data.progress, message: data.message ?? '' };
          },
          onComplete: () => {
            deleteProgress = null;
            isUpdating = false;
            onaction?.();
          },
          onError: () => {
            deleteProgress = null;
            isUpdating = false;
            error = 'Delete operation failed';
          },
        });
      } else {
        isUpdating = false;
        onaction?.();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      isUpdating = false;
    }
  }
</script>

<div class="panel flex flex-wrap items-center gap-3">
  <button
    onclick={toggleReview}
    disabled={isUpdating}
    class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
  >
    {reviewed ? 'Unmark Reviewed' : 'Mark Reviewed'}
  </button>

  {#if !resolved}
    <button
      onclick={markResolved}
      disabled={isUpdating}
      class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      Resolve Group
    </button>
  {/if}

  <button
    onclick={() => {
      showDeleteConfirm = true;
    }}
    disabled={isUpdating || memberCount < 2}
    class="bg-ember rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
  >
    Delete Non-Primary
  </button>

  {#if deleteProgress}
    <div class="text-muted flex items-center gap-2 text-sm">
      <span
        class="border-accent inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
      ></span>
      {deleteProgress.message || `${Math.round(deleteProgress.progress * 100)}%`}
    </div>
  {/if}

  {#if error}
    <span class="text-ember text-sm">{error}</span>
  {/if}
</div>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Non-Primary Documents"
  message="This will permanently delete all non-primary documents in this group from Paperless-NGX. This action cannot be undone."
  confirmLabel="Delete Documents"
  variant="ember"
  onconfirm={deleteNonPrimary}
  oncancel={() => {
    showDeleteConfirm = false;
  }}
/>
