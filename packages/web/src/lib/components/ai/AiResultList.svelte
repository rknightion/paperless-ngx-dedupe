<script lang="ts">
  import { Sparkles } from 'lucide-svelte';
  import AiResultRow from './AiResultRow.svelte';
  import AiResultCard from './AiResultCard.svelte';
  import {
    selectedIds,
    getActiveResultId,
    toggleSelection,
    selectAllIds,
    clearSelection,
    selectResult,
  } from './AiReviewStore.svelte';
  import type { AiResultSummary } from './AiReviewStore.svelte';

  interface Props {
    results: AiResultSummary[];
    viewMode: 'table' | 'cards';
    onapply: (id: string) => void;
    onreject: (id: string) => void;
  }

  let { results, viewMode, onapply, onreject }: Props = $props();

  const activeResultId = $derived(getActiveResultId());
  const allSelected = $derived(results.length > 0 && results.every((r) => selectedIds.has(r.id)));

  function toggleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllIds(results.map((r) => r.id));
    }
  }
</script>

{#if results.length === 0}
  <div class="panel flex flex-col items-center py-16 text-center">
    <div class="bg-accent-subtle mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
      <Sparkles class="text-accent h-7 w-7" />
    </div>
    <p class="text-ink text-base font-medium">No results found</p>
    <p class="text-muted mx-auto mt-2 max-w-sm text-sm">
      Try adjusting your filters or process more documents to see results here.
    </p>
  </div>
{:else if viewMode === 'table'}
  <div class="border-soft overflow-x-auto rounded-xl border">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-soft bg-canvas/60 border-b">
          <th class="w-10 px-4 py-3">
            <input
              type="checkbox"
              checked={allSelected}
              onchange={toggleSelectAll}
              class="rounded"
            />
          </th>
          <th class="text-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">Document</th>
          <th
            class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
            >Suggested Title</th
          >
          <th
            class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
            >Correspondent</th
          >
          <th
            class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
            >Document Type</th
          >
          <th
            class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase lg:table-cell"
            >Tags</th
          >
          <th class="text-muted px-4 py-3 text-xs font-medium tracking-wide uppercase"
            >Confidence</th
          >
          <th
            class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase sm:table-cell"
            >Status</th
          >
          <th class="text-muted w-24 px-4 py-3 text-xs font-medium tracking-wide uppercase"
            >Actions</th
          >
        </tr>
      </thead>
      <tbody>
        {#each results as result (result.id)}
          <AiResultRow
            {result}
            isSelected={selectedIds.has(result.id)}
            isActive={activeResultId === result.id}
            onselect={() => toggleSelection(result.id)}
            onclick={() => selectResult(result.id)}
            onapply={() => onapply(result.id)}
            onreject={() => onreject(result.id)}
          />
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="space-y-3">
    {#each results as result (result.id)}
      <AiResultCard
        {result}
        isSelected={selectedIds.has(result.id)}
        isActive={activeResultId === result.id}
        onselect={() => toggleSelection(result.id)}
        onclick={() => selectResult(result.id)}
        onapply={() => onapply(result.id)}
        onreject={() => onreject(result.id)}
      />
    {/each}
  </div>
{/if}
