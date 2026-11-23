<script lang="ts">
  import { page } from '$app/state';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';

  const readOnly = $derived(page.data.readOnly === true);

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
    <!-- Both actions stay inline: they are success-tinted and ember-tinted controls, and Button
         deliberately has no semantic-tint variant. -->
    <button
      onclick={onbatchapply}
      disabled={readOnly}
      title={readOnly ? 'Paperless is read-only' : undefined}
      class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
    >
      <CheckIcon class="h-3.5 w-3.5" /> Review selected fields
    </button>
    <button
      onclick={onbatchreject}
      class="text-ember border-ember/20 hover:bg-ember-light flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
    >
      <XIcon class="h-3.5 w-3.5" /> Reject selected
    </button>
  </div>
{/if}
