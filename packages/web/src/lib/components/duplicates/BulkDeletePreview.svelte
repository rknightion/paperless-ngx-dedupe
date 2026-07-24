<script lang="ts">
  import { ConfirmDialog } from '$lib/components';

  type FrozenDocument = { documentId: string; paperlessId: number };
  type FrozenGroup = {
    groupId: string;
    primaryPaperlessId: number;
    nonPrimaryDocuments: FrozenDocument[];
  };
  interface Preview {
    planToken: string;
    expiresAt: string;
    groupCount: number;
    documentCount: number;
    groups: FrozenGroup[];
  }
  interface Props {
    open: boolean;
    groupIds: string[];
    oncancel: () => void;
    onsubmitted: (jobId?: string) => void;
  }

  let { open, groupIds, oncancel, onsubmitted }: Props = $props();
  let dialog = $state<HTMLDialogElement>();
  let cancelButton = $state<HTMLButtonElement>();
  let preview = $state<Preview | null>(null);
  let loading = $state(false);
  let executing = $state(false);
  let reviewed = $state(false);
  let showConfirm = $state(false);
  let error = $state<string | null>(null);
  let snapshotIds = $state<string[]>([]);
  let wasOpen = $state(false);
  let requestGeneration = 0;
  let requestController: AbortController | null = null;
  let restoreFocus: HTMLElement | null = null;

  function selectionKey(ids: string[]): string {
    return [...ids].sort().join('\u0000');
  }

  function invalidatePlan(message: string) {
    preview = null;
    reviewed = false;
    error = message;
  }

  async function loadPreview(ids = snapshotIds) {
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const generation = ++requestGeneration;
    const expectedSelection = selectionKey(ids);
    loading = true;
    preview = null;
    reviewed = false;
    error = null;
    try {
      const response = await fetch('/api/v1/batch/delete-non-primary/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: ids }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (
        generation !== requestGeneration ||
        expectedSelection !== selectionKey(snapshotIds) ||
        !open
      ) {
        return;
      }
      if (!response.ok) {
        invalidatePlan(
          body.error?.message ??
            'The reviewed selection changed or expired. Refresh the inbox and review it again.',
        );
        return;
      }
      preview = body.data;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        return;
      }
      if (generation === requestGeneration && expectedSelection === selectionKey(snapshotIds)) {
        invalidatePlan('Unable to create the reviewed deletion preview. Try again.');
      }
    } finally {
      if (generation === requestGeneration) loading = false;
    }
  }

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      snapshotIds = [...groupIds];
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (dialog && !dialog.open) {
        dialog.showModal();
        queueMicrotask(() => cancelButton?.focus());
      }
      void loadPreview(snapshotIds);
    } else if (!open && wasOpen) {
      wasOpen = false;
      requestController?.abort();
      requestGeneration++;
      showConfirm = false;
      executing = false;
      if (dialog?.open) dialog.close();
      restoreFocus?.focus();
      restoreFocus = null;
    }
  });

  function cancel() {
    oncancel();
  }

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      ),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function execute() {
    if (executing || !preview) return;
    executing = true;
    showConfirm = false;
    error = null;
    try {
      const response = await fetch('/api/v1/batch/delete-non-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planToken: preview.planToken, confirm: true }),
      });
      const body = await response.json();
      if (!response.ok) {
        invalidatePlan(
          body.error?.message ??
            'This reviewed plan expired or conflicts with current data. Review the selection again.',
        );
        return;
      }
      onsubmitted(body.data?.jobId);
    } catch {
      invalidatePlan('Unable to start the reviewed deletion. Review the selection again.');
    } finally {
      executing = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="bulk-preview-title"
  onkeydown={trapFocus}
  oncancel={(event) => {
    event.preventDefault();
    cancel();
  }}
  class="border-soft bg-surface m-auto max-h-[90vh] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-xl border p-0 shadow-xl backdrop:bg-black/40"
>
  <div class="p-5 sm:p-6">
    <h2 id="bulk-preview-title" class="text-ink text-lg font-semibold">
      Review documents to delete
    </h2>
    <p class="text-muted mt-2 text-sm">
      This list comes from the server-side reviewed plan. Documents are moved to the Paperless-NGX
      recycle bin, where they can be restored.
    </p>

    {#if loading && !preview}
      <p class="text-muted mt-5 text-sm">Preparing exact deletion preview…</p>
    {:else if error}
      <div role="alert" class="bg-ember-light text-ember mt-5 rounded-lg px-3 py-2 text-sm">
        {error}
      </div>
      {#if !preview}
        <button
          type="button"
          onclick={() => loadPreview(snapshotIds)}
          disabled={loading || executing}
          class="border-soft text-ink mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Review selection again
        </button>
      {/if}
    {:else if preview}
      <div class="mt-5 space-y-3">
        {#each preview.groups as group (group.groupId)}
          <section class="border-soft rounded-lg border p-3">
            <h3 class="text-ink text-sm font-semibold">
              Primary kept: Paperless document #{group.primaryPaperlessId}
            </h3>
            <ul class="text-muted mt-2 list-inside list-disc text-sm">
              {#each group.nonPrimaryDocuments as document (document.documentId)}
                <li>Paperless document #{document.paperlessId}</li>
              {/each}
            </ul>
          </section>
        {/each}
        <p class="text-muted text-xs">
          Review expires {new Date(preview.expiresAt).toLocaleString()}.
        </p>
        <label class="text-ink flex items-start gap-2 text-sm">
          <input type="checkbox" bind:checked={reviewed} class="mt-0.5" />
          I reviewed this exact deletion list
        </label>
      </div>
    {/if}

    <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        bind:this={cancelButton}
        type="button"
        onclick={cancel}
        disabled={executing}
        class="border-soft text-ink rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Cancel
      </button>
      {#if preview}
        <button
          type="button"
          disabled={!reviewed || loading || executing}
          onclick={() => (showConfirm = true)}
          class="bg-ember rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Delete {preview.documentCount} document{preview.documentCount === 1 ? '' : 's'}
        </button>
      {/if}
    </div>
  </div>
</dialog>

<ConfirmDialog
  open={showConfirm}
  title="Confirm deletion of reviewed documents"
  message="Move only the documents in the reviewed list to the Paperless-NGX recycle bin?"
  confirmLabel="Move documents to recycle bin"
  variant="ember"
  onconfirm={execute}
  oncancel={() => (showConfirm = false)}
/>
