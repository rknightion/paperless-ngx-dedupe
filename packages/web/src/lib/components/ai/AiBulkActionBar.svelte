<script lang="ts">
  import { Check, X } from 'lucide-svelte';

  interface Props {
    selectedCount: number;
    onbatchapply: () => void;
    onbatchreject: () => void;
  }

  let { selectedCount, onbatchapply, onbatchreject }: Props = $props();
</script>

{#if selectedCount > 0}
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-muted text-sm font-medium">{selectedCount} selected across pages</span>
    <button
      onclick={onbatchapply}
      class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
    >
      <Check class="h-3.5 w-3.5" /> Review selected fields
    </button>
    <button
      onclick={onbatchreject}
      class="text-ember border-ember/20 hover:bg-ember-light flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
    >
      <X class="h-3.5 w-3.5" /> Reject selected
    </button>
  </div>
{/if}
