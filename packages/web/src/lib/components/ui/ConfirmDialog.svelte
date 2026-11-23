<script lang="ts">
  import { type Snippet } from 'svelte';

  interface Props {
    open: boolean;
    /** A question naming the target, with its count where there is one. */
    title: string;
    /** What will happen. */
    message: string;
    /** What will not happen. Optional second paragraph. */
    detail?: string;
    confirmLabel?: string;
    variant?: 'accent' | 'ember';
    onconfirm: () => void;
    oncancel: () => void;
    children?: Snippet;
    confirmDisabled?: boolean;
    /** Why the confirm button is disabled, wired to it with aria-describedby. */
    confirmDisabledReason?: string;
    /**
     * When set, a mono input must match this literal (usually the count)
     * before the confirm button enables. For irreversible actions only.
     */
    requireTyped?: string;
  }

  let {
    open,
    title,
    message,
    detail,
    confirmLabel = 'Confirm',
    variant = 'ember',
    onconfirm,
    oncancel,
    children,
    confirmDisabled = false,
    confirmDisabledReason,
    requireTyped,
  }: Props = $props();

  const dialogId = $props.id();
  let dialog: HTMLDialogElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let typed = $state('');

  const typedMismatch = $derived(requireTyped !== undefined && typed.trim() !== requireTyped);
  const disabled = $derived(confirmDisabled || typedMismatch);
  const reason = $derived(
    confirmDisabledReason ??
      (typedMismatch ? `Type ${requireTyped} above to enable this button.` : undefined),
  );

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Focus opens on Cancel, never on the destructive button.
      cancelButton?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  $effect(() => {
    if (!open) typed = '';
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  const confirmClasses = {
    accent: 'bg-accent text-on-accent hover:bg-accent-hover',
    ember: 'bg-ember text-on-accent hover:brightness-92',
  } as const;
</script>

<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (e.target === dialog) oncancel();
  }}
  class="border-border-hover bg-surface-raised text-ink rounded-overlay backdrop:bg-inverse/55 m-auto w-[calc(100%-2rem)] max-w-[560px] border p-0 shadow-lg open:animate-[scale-in_var(--duration-base)_var(--ease-standard)]"
  aria-labelledby={`${dialogId}-title`}
  aria-describedby={detail ? `${dialogId}-message ${dialogId}-detail` : `${dialogId}-message`}
>
  <div class="p-6">
    <h2 id={`${dialogId}-title`} class="text-ink text-lg font-semibold">{title}</h2>
    <p id={`${dialogId}-message`} class="text-ink-light mt-2 text-base">{message}</p>
    {#if detail}
      <p id={`${dialogId}-detail`} class="text-muted mt-2 text-base">{detail}</p>
    {/if}
    {@render children?.()}
    {#if requireTyped !== undefined}
      <div class="mt-4 flex flex-col gap-1.5">
        <label for={`${dialogId}-typed`} class="text-ink text-sm font-medium">
          Type <span class="font-mono">{requireTyped}</span> to confirm
        </label>
        <input
          id={`${dialogId}-typed`}
          type="text"
          bind:value={typed}
          autocomplete="off"
          spellcheck="false"
          class="border-border bg-surface-raised text-ink h-7 w-full rounded-md border px-2 font-mono text-sm tabular-nums"
        />
      </div>
    {/if}
    {#if disabled && reason}
      <p id={`${dialogId}-reason`} class="text-muted mt-3 text-sm">{reason}</p>
    {/if}
    <div class="mt-6 flex justify-end gap-3">
      <button
        bind:this={cancelButton}
        type="button"
        onclick={oncancel}
        class="border-border bg-surface text-ink hover:bg-canvas-deep h-7 cursor-pointer rounded-md border px-3 text-sm font-medium"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={onconfirm}
        {disabled}
        aria-describedby={disabled && reason ? `${dialogId}-reason` : undefined}
        class="disabled:border-border disabled:text-disabled h-7 cursor-pointer rounded-md border border-transparent px-3 text-sm font-medium disabled:cursor-not-allowed disabled:bg-transparent {confirmClasses[
          variant
        ]}"
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>
