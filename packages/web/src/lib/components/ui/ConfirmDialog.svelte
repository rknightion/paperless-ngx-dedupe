<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'accent' | 'ember';
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    variant = 'ember',
    onconfirm,
    oncancel,
  }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  const confirmClasses = {
    accent: 'bg-accent text-white hover:bg-accent-hover',
    ember: 'bg-ember text-white hover:opacity-90',
  } as const;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => { if (e.target === dialog) oncancel(); }}
  class="m-auto max-w-md rounded-xl border border-soft bg-surface p-0 shadow-lg backdrop:bg-black/40"
  aria-labelledby="confirm-dialog-title"
  aria-describedby="confirm-dialog-message"
>
  <div class="p-6">
    <h2 id="confirm-dialog-title" class="text-lg font-semibold text-ink">{title}</h2>
    <p id="confirm-dialog-message" class="mt-2 text-sm text-muted">{message}</p>
    <div class="mt-6 flex justify-end gap-3">
      <button
        onclick={oncancel}
        class="rounded-lg border border-soft px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
      >
        Cancel
      </button>
      <button
        onclick={onconfirm}
        class="rounded-lg px-4 py-2 text-sm font-medium {confirmClasses[variant]}"
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>
