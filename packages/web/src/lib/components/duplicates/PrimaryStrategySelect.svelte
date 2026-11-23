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
    class="border-border bg-surface-raised text-ink disabled:text-disabled mt-1 h-7 w-full rounded-sm border px-2 text-sm disabled:cursor-not-allowed"
  >
    {#each PRIMARY_STRATEGIES as strategy (strategy)}<option value={strategy}>
        {labels[strategy]}
      </option>{/each}
  </select>
</div>
