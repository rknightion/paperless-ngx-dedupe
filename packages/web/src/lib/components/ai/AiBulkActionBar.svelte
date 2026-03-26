<script lang="ts">
  import { ConfirmDialog } from '$lib/components';
  import { Check, X } from 'lucide-svelte';

  interface Props {
    selectedCount: number;
    pendingCount: number;
    onbatchapply: () => void;
    onbatchreject: () => void;
    onapplyall: () => void;
    onrejectall: () => void;
  }

  let { selectedCount, pendingCount, onbatchapply, onbatchreject, onapplyall, onrejectall }: Props =
    $props();

  let confirmAction = $state<'apply-all' | 'reject-all' | null>(null);

  function handleConfirm() {
    if (confirmAction === 'apply-all') {
      onapplyall();
    } else if (confirmAction === 'reject-all') {
      onrejectall();
    }
    confirmAction = null;
  }
</script>

{#if selectedCount > 0 || pendingCount > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#if selectedCount > 0}
      <span class="text-muted text-sm font-medium">{selectedCount} selected</span>
      <button
        onclick={onbatchapply}
        class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <Check class="h-3.5 w-3.5" /> Apply Selected
      </button>
      <button
        onclick={onbatchreject}
        class="text-ember border-ember/20 hover:bg-ember-light flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <X class="h-3.5 w-3.5" /> Reject Selected
      </button>
    {/if}

    {#if selectedCount > 0 && pendingCount > 0}
      <div class="border-soft mx-1 h-5 border-l"></div>
    {/if}

    {#if pendingCount > 0}
      <button
        onclick={() => (confirmAction = 'apply-all')}
        class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <Check class="h-3.5 w-3.5" /> Apply All ({pendingCount})
      </button>
      <button
        onclick={() => (confirmAction = 'reject-all')}
        class="text-muted hover:bg-canvas flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <X class="h-3.5 w-3.5" /> Reject All ({pendingCount})
      </button>
    {/if}
  </div>
{/if}

<ConfirmDialog
  open={confirmAction === 'apply-all'}
  title="Apply All Pending Results?"
  message="This will apply AI suggestions to all {pendingCount} pending document{pendingCount === 1
    ? ''
    : 's'}. Changes will be pushed to Paperless-NGX."
  confirmLabel="Apply All"
  variant="accent"
  onconfirm={handleConfirm}
  oncancel={() => (confirmAction = null)}
/>

<ConfirmDialog
  open={confirmAction === 'reject-all'}
  title="Reject All Pending Results?"
  message="This will reject all {pendingCount} pending result{pendingCount === 1
    ? ''
    : 's'}. No changes will be made to your documents."
  confirmLabel="Reject All"
  variant="ember"
  onconfirm={handleConfirm}
  oncancel={() => (confirmAction = null)}
/>
