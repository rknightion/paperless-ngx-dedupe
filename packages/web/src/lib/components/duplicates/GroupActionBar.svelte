<script lang="ts">
  import { goto } from '$app/navigation';
  import { ConfirmDialog, RecycleBinPrompt } from '$lib/components';
  import { connectJobSSE } from '$lib/sse';

  interface Props {
    groupId: string;
    status: string;
    memberCount: number;
    onaction?: () => void;
  }

  let { groupId, status, memberCount, onaction }: Props = $props();

  let isUpdating = $state(false);
  let error = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let deleteProgress = $state<{ progress: number; message: string } | null>(null);
  let showRecycleBinPrompt = $state(false);

  async function setStatus(newStatus: string) {
    isUpdating = true;
    error = null;
    try {
      const res = await fetch(`/api/v1/duplicates/${groupId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
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
            showRecycleBinPrompt = true;
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
  {#if status === 'pending'}
    <button
      onclick={() => setStatus('false_positive')}
      disabled={isUpdating}
      class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      Not a Duplicate
    </button>

    <button
      onclick={() => setStatus('ignored')}
      disabled={isUpdating}
      class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      Keep All
    </button>

    <button
      onclick={() => {
        showDeleteConfirm = true;
      }}
      disabled={isUpdating || memberCount < 2}
      class="bg-ember rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      Delete Duplicates
    </button>
  {:else}
    <button
      onclick={() => setStatus('pending')}
      disabled={isUpdating}
      class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      Reopen
    </button>
  {/if}

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
  message="This will delete all non-primary documents in this group from Paperless-NGX. Documents are moved to the Paperless-NGX recycle bin and can be restored from there."
  confirmLabel="Delete Documents"
  variant="ember"
  onconfirm={deleteNonPrimary}
  oncancel={() => {
    showDeleteConfirm = false;
  }}
/>

{#if showRecycleBinPrompt}
  <dialog
    open
    onclick={(e) => {
      if (e.target === e.currentTarget) goto('/duplicates');
    }}
    class="border-soft bg-surface fixed inset-0 z-50 m-auto max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/40"
  >
    <h2 class="text-ink text-lg font-semibold">Delete Complete</h2>
    <RecycleBinPrompt onclose={() => goto('/duplicates')} />
  </dialog>
{/if}
