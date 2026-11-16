<script lang="ts">
  import { PRIMARY_STRATEGIES, type PrimaryStrategy } from '@paperless-dedupe/core/dedup/types';
  let {
    value = $bindable('lowest_id'),
    disabled = false,
  }: { value?: PrimaryStrategy; disabled?: boolean } = $props();
  const id = $props.id();
  const labels: Record<PrimaryStrategy, string> = {
    lowest_id: 'Lowest Paperless ID',
    oldest_added: 'Oldest added',
    newest_added: 'Newest added',
    most_text: 'Most text',
    most_metadata: 'Most metadata',
  };
</script>

<div>
  <label for={id} class="text-ink block text-sm font-medium">Keeper rule</label>
  <select
    {id}
    bind:value
    {disabled}
    class="border-soft bg-surface text-ink mt-2 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
  >
    {#each PRIMARY_STRATEGIES as strategy (strategy)}<option value={strategy}
        >{labels[strategy]}</option
      >{/each}
  </select>
</div>
