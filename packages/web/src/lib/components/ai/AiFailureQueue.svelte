<script lang="ts">
  import type { AiFailureCategory, AiFailureGroup, AiResultSummary } from '@paperless-dedupe/core';
  import { RefreshCw } from 'lucide-svelte';

  interface Props {
    results: AiResultSummary[];
    groups: AiFailureGroup[];
    onretrygroup: (category: AiFailureCategory, resultIds: string[]) => Promise<void>;
    onopen: (id: string) => void;
  }

  let { results, groups, onretrygroup, onopen }: Props = $props();
  let retrying = $state<AiFailureCategory | null>(null);

  async function retry(category: AiFailureCategory): Promise<void> {
    const resultIds = results
      .filter((result) => result.safeFailure?.category === category)
      .map((result) => result.id);
    if (resultIds.length === 0) return;
    retrying = category;
    try {
      await onretrygroup(category, resultIds);
    } finally {
      retrying = null;
    }
  }
</script>

<section class="space-y-4" aria-labelledby="failure-queue-title">
  <div>
    <h2 id="failure-queue-title" class="text-ink text-lg font-semibold">Extraction failures</h2>
    <p class="text-muted text-sm">
      Failures are grouped into safe categories. Review a group before retrying extraction.
    </p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    {#each groups as group (group.category)}
      <article class="border-soft bg-surface rounded-xl border p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-ink text-sm font-semibold">{group.label}</h3>
            <p class="text-muted text-xs">{group.count} failure{group.count === 1 ? '' : 's'}</p>
          </div>
          <button
            type="button"
            onclick={() => retry(group.category)}
            disabled={retrying !== null}
            class="border-soft text-accent hover:bg-accent-subtle flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw class="h-3.5 w-3.5 {retrying === group.category ? 'animate-spin' : ''}" />
            Retry visible
          </button>
        </div>
      </article>
    {/each}
  </div>

  <div class="border-soft divide-soft divide-y rounded-xl border">
    {#each results as result (result.id)}
      <button
        type="button"
        onclick={() => onopen(result.id)}
        class="hover:bg-accent-subtle/40 flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span class="min-w-0">
          <span class="text-ink block truncate text-sm font-medium">{result.documentTitle}</span>
          <span class="text-muted block text-xs">
            {result.safeFailure?.label ?? 'Extraction could not be completed'}
          </span>
        </span>
        <span class="text-accent shrink-0 text-xs font-medium">Review</span>
      </button>
    {:else}
      <p class="text-muted p-8 text-center text-sm">No extraction failures match these filters.</p>
    {/each}
  </div>
</section>
