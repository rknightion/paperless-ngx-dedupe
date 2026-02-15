<script lang="ts">
  import { ConfirmDialog } from '$lib/components';

  interface Props {
    onclose?: () => void;
  }

  let { onclose }: Props = $props();

  let trashCount = $state<number | null>(null);
  let isLoading = $state(true);
  let isEmptying = $state(false);
  let showEmptyConfirm = $state(false);
  let emptyResult = $state<{ success: boolean; error?: string } | null>(null);

  async function fetchTrashCount() {
    isLoading = true;
    try {
      const res = await fetch('/api/v1/paperless/trash');
      if (res.ok) {
        const json = await res.json();
        trashCount = json.data?.count ?? 0;
      } else {
        trashCount = null;
      }
    } catch {
      trashCount = null;
    }
    isLoading = false;
  }

  async function emptyTrash() {
    showEmptyConfirm = false;
    isEmptying = true;
    emptyResult = null;
    try {
      const res = await fetch('/api/v1/paperless/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'empty' }),
      });
      if (res.ok) {
        emptyResult = { success: true };
        trashCount = 0;
      } else {
        emptyResult = { success: false, error: 'Failed to empty recycle bin' };
      }
    } catch {
      emptyResult = { success: false, error: 'Request failed' };
    }
    isEmptying = false;
  }

  $effect(() => {
    fetchTrashCount();
  });
</script>

<div class="border-soft mt-4 rounded-lg border px-4 py-4">
  <h3 class="text-ink text-base font-semibold">Paperless-NGX Recycle Bin</h3>
  <p class="text-muted mt-1 text-sm">
    Deleted documents have been moved to the Paperless-NGX recycle bin.
  </p>

  {#if isLoading}
    <p class="text-muted mt-3 text-sm">Loading recycle bin status...</p>
  {:else if trashCount !== null && trashCount > 0}
    <p class="text-ink mt-3 text-sm">
      <span class="font-semibold">{trashCount}</span>
      document{trashCount === 1 ? '' : 's'} currently in the recycle bin.
    </p>

    {#if emptyResult?.success}
      <div class="bg-success-light text-success mt-3 rounded-lg px-3 py-2 text-sm">
        Recycle bin emptied successfully.
      </div>
    {:else}
      <button
        onclick={() => (showEmptyConfirm = true)}
        disabled={isEmptying}
        class="bg-ember mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {isEmptying ? 'Emptying...' : 'Empty Recycle Bin'}
      </button>
    {/if}

    {#if emptyResult && !emptyResult.success}
      <div class="bg-ember-light text-ember mt-2 rounded-lg px-3 py-2 text-sm">
        {emptyResult.error}
      </div>
    {/if}
  {:else if trashCount === 0}
    <p class="text-muted mt-3 text-sm">The recycle bin is empty.</p>
  {:else}
    <p class="text-muted mt-3 text-sm">Unable to check recycle bin status.</p>
  {/if}

  {#if onclose}
    <div class="mt-4 flex justify-end">
      <button
        onclick={onclose}
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Close
      </button>
    </div>
  {/if}
</div>

<ConfirmDialog
  open={showEmptyConfirm}
  title="Empty Recycle Bin"
  message="This will permanently delete all documents in the Paperless-NGX recycle bin. This action cannot be undone."
  confirmLabel="Empty Recycle Bin"
  variant="ember"
  onconfirm={emptyTrash}
  oncancel={() => (showEmptyConfirm = false)}
/>
