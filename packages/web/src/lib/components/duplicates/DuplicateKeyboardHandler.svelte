<script lang="ts">
  import { Button } from '$lib/components';
  import { resolveDuplicateShortcut, type DuplicateShortcutState } from './duplicate-keyboard';
  let {
    shortcutState,
    onaction,
    onselect,
    onprimary,
    onskip,
  }: {
    shortcutState: Omit<DuplicateShortcutState, 'dialogOpen'>;
    onaction: (label: string) => void;
    onselect: (index: number) => void;
    onprimary: () => void;
    onskip: () => void;
  } = $props();
  let helpOpen = $state(false);
  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = $props.id();
  const shortcuts = [
    ['n', 'Not a duplicate'],
    ['k', 'Keep all'],
    ['d', 'Open deletion confirmation'],
    ['s', 'Skip to the next group'],
    ['1–9', 'Select a comparison document'],
    ['p', 'Make the selected document primary'],
    ['?', 'Show shortcut help'],
  ];
  $effect(() => {
    if (helpOpen) dialog?.showModal();
    else dialog?.close();
  });
  function handleKeydown(event: KeyboardEvent) {
    const action = resolveDuplicateShortcut(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
        target: event.target instanceof HTMLElement ? event.target : null,
      },
      {
        ...shortcutState,
        dialogOpen: Boolean(
          document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'),
        ),
      },
    );
    if (!action) return;
    event.preventDefault();
    switch (action) {
      case 'not-duplicate':
        onaction('Not a Duplicate');
        break;
      case 'keep-all':
        onaction('Keep All');
        break;
      case 'delete':
        onaction('Delete Duplicates');
        break;
      case 'skip':
        onskip();
        break;
      case 'compare':
        onselect(Number(event.key) - 1);
        break;
      case 'primary':
        onprimary();
        break;
      case 'help':
        helpOpen = true;
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<Button variant="secondary" size="sm" onclick={() => (helpOpen = true)}>
  Keyboard shortcuts (?)
</Button>
<dialog
  bind:this={dialog}
  onclose={() => (helpOpen = false)}
  oncancel={() => (helpOpen = false)}
  aria-labelledby={titleId}
  class="border-soft bg-surface m-auto max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/40"
>
  <h2 id={titleId} class="text-ink text-lg font-semibold">Keyboard shortcuts</h2>
  <dl class="mt-4 space-y-3">
    {#each shortcuts as [key, description] (key)}
      <div class="grid grid-cols-[3rem_1fr] gap-3">
        <dt><kbd class="border-soft text-ink rounded border px-2 py-1 text-sm">{key}</kbd></dt>
        <dd class="text-muted text-sm">{description}</dd>
      </div>
    {/each}
  </dl>
  <p class="text-muted mt-4 text-sm">
    Shortcuts pause while typing or a dialog is open. Deletion always requires confirmation.
  </p>
  <div class="mt-5 flex justify-end">
    <Button variant="secondary" onclick={() => (helpOpen = false)}>Close</Button>
  </div>
</dialog>
