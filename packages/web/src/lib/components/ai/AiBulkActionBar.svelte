<script lang="ts">
  import { page } from '$app/state';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';

  const readOnly = $derived(page.data.readOnly === true);

  interface Props {
    selectedCount: number;
    onbatchapply: () => void;
    onbatchreject: () => void;
    onclear?: () => void;
  }

  let { selectedCount, onbatchapply, onbatchreject, onclear }: Props = $props();

  // Controls sit on the inverse surface, so they use the on-inverse ink and a
  // translucent hairline derived from it instead of a fixed colour.
  const BTN =
    'inline-flex h-7 items-center gap-1.5 rounded-sm border border-[color-mix(in_oklab,var(--color-on-inverse)_30%,transparent)] bg-transparent px-2.5 text-sm font-medium text-on-inverse transition-colors hover:bg-[color-mix(in_oklab,var(--color-on-inverse)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#if selectedCount > 0}
  <div
    class="bg-inverse text-on-inverse sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5"
  >
    <span class="font-mono text-xs tabular-nums">{selectedCount} selected across pages</span>
    <span class="text-sm opacity-80">
      Choose the fields below, then review before anything is written to Paperless.
    </span>
    <div class="ml-auto flex items-center gap-2">
      <button
        onclick={onbatchapply}
        disabled={readOnly}
        title={readOnly ? 'Paperless is read-only' : undefined}
        class={BTN}
      >
        <CheckIcon class="h-3.5 w-3.5" /> Review selected fields
      </button>
      <button onclick={onbatchreject} class={BTN}>
        <XIcon class="h-3.5 w-3.5" /> Reject selected
      </button>
      {#if onclear}
        <button
          onclick={onclear}
          class="text-on-inverse h-7 bg-transparent px-1.5 text-sm opacity-75 hover:opacity-100"
        >
          Clear
        </button>
      {/if}
    </div>
  </div>
{/if}
