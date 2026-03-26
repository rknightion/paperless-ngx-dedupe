<script lang="ts">
  import { ConfirmDialog } from '$lib/components';
  import { Check, X } from 'lucide-svelte';
  import type { SelectionMode } from './AiReviewStore.svelte';

  interface Props {
    selectedCount: number;
    pendingCount: number;
    selectionMode: SelectionMode;
    totalFilterMatch: number;
    onbatchapply: () => void;
    onbatchreject: () => void;
    onapplyall: () => void;
    onrejectall: () => void;
    onselectallfilter: () => void;
    onclearfilterselection: () => void;
  }

  let {
    selectedCount,
    pendingCount,
    selectionMode,
    totalFilterMatch,
    onbatchapply,
    onbatchreject,
    onapplyall,
    onrejectall,
    onselectallfilter,
    onclearfilterselection,
  }: Props = $props();

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

{#if selectedCount > 0 || pendingCount > 0 || selectionMode.type === 'all_matching_filter'}
  <div class="flex flex-wrap items-center gap-2">
    {#if selectionMode.type === 'all_matching_filter'}
      <span class="text-accent text-sm font-medium">
        All {selectionMode.matchCount.toLocaleString()} matching current filter selected
      </span>
      <button
        onclick={onbatchapply}
        class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <Check class="h-3.5 w-3.5" /> Apply Matching
      </button>
      <button
        onclick={onbatchreject}
        class="text-ember border-ember/20 hover:bg-ember-light flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <X class="h-3.5 w-3.5" /> Reject Matching
      </button>
      <button
        onclick={onclearfilterselection}
        class="text-muted hover:text-ink text-sm font-medium underline transition-colors"
      >
        Clear
      </button>
    {:else if selectedCount > 0}
      <span class="text-muted text-sm font-medium">{selectedCount} selected</span>
      {#if totalFilterMatch > selectedCount}
        <button
          onclick={onselectallfilter}
          class="text-accent text-sm font-medium underline transition-colors"
        >
          Select all {totalFilterMatch.toLocaleString()} matching current filter
        </button>
      {/if}
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

    {#if (selectedCount > 0 || selectionMode.type === 'all_matching_filter') && pendingCount > 0}
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
