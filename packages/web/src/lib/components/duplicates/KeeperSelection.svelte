<script lang="ts">
  import { type PrimaryStrategy } from '@paperless-dedupe/core/dedup/types';
  import { Button } from '$lib/components';
  import PrimaryStrategySelect from './PrimaryStrategySelect.svelte';
  let {
    minConfidence,
    onApplied,
    busy = $bindable(false),
  }: { minConfidence: number; onApplied: () => void; busy?: boolean } = $props();
  let strategy = $state<PrimaryStrategy>('lowest_id');
  let includeManual = $state(false);
  let error = $state('');
  let notice = $state('');
  type Preview = {
    groupsEvaluated: number;
    groupsChanging: number;
    sample: {
      groupId: string;
      current: { paperlessId: number; title: string | null };
      proposed: { paperlessId: number; title: string | null };
      reason: string;
    }[];
  };
  let preview = $state<{ key: string; data: Preview } | null>(null);
  const requestKey = $derived(JSON.stringify({ strategy, minConfidence, includeManual }));
  const current = $derived(preview?.key === requestKey ? preview.data : null);

  async function run(apply: boolean) {
    if (busy || (apply && !current)) return;
    busy = true;
    error = '';
    notice = '';
    const key = requestKey;
    const body = {
      strategy,
      minConfidence,
      includeManual,
      ...(apply ? { expectedChanging: current!.groupsChanging } : {}),
    };
    try {
      const response = await fetch(`/api/v1/duplicates/primary/${apply ? 'apply' : 'preview'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        preview = null;
        error =
          response.status === 409
            ? 'The pending groups changed or another operation is running. Preview again before applying.'
            : 'Could not update keeper selection. Try previewing again.';
        return;
      }
      const { data } = await response.json();
      if (apply) {
        preview = null;
        notice = `Updated ${data.updated} keepers. Review the selected groups before deleting documents.`;
        onApplied();
      } else preview = { key, data };
    } catch {
      preview = null;
      error = 'Could not update keeper selection. Try previewing again.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="border-soft space-y-3 border p-4" aria-label="Keeper selection">
  <PrimaryStrategySelect bind:value={strategy} disabled={busy} />
  <p class="text-muted text-sm">
    Preview a rule for pending groups at this confidence threshold. This only changes local keepers;
    it never deletes or changes Paperless documents.
  </p>
  <label class="text-ink flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={includeManual} disabled={busy} />Include manually selected
    keepers
  </label>
  <Button variant="secondary" disabled={busy} onclick={() => run(false)}>
    Preview keeper changes
  </Button>
  {#if current}
    <p class="text-ink text-sm">
      Would change the keeper in {current.groupsChanging} of {current.groupsEvaluated} groups
    </p>
    <ul class="space-y-2">
      {#each current.sample as item (item.groupId)}
        <li class="border-soft border-t pt-2 text-sm break-words">
          <p class="text-ink">
            {item.current.title ?? 'Untitled'} (#{item.current.paperlessId}) → {item.proposed
              .title ?? 'Untitled'} (#{item.proposed.paperlessId})
          </p>
          <p class="text-muted mt-1 font-mono text-xs">{item.reason}</p>
        </li>
      {/each}
    </ul>
    <Button disabled={busy || current.groupsChanging === 0} onclick={() => run(true)}>
      Apply keeper changes
    </Button>
  {/if}
  {#if error}<p role="alert" class="text-ember text-sm">{error}</p>{/if}
  {#if notice}<p role="status" class="text-success text-sm">{notice}</p>{/if}
</section>
