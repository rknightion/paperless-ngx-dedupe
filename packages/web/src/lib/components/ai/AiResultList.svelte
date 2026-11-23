<script lang="ts">
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
      clearSelection(results.map((result) => result.id));
    } else {
      selectAllIds(results.map((r) => r.id));
    }
  }
</script>

{#if results.length === 0}
  <div class="text-muted mx-auto max-w-sm py-16 text-center text-sm">
    <p class="text-ink font-medium">No results found</p>
    <p class="mt-1">Try adjusting your filters or process more documents to see results here.</p>
  </div>
{:else if viewMode === 'table'}
  <div class="border-border border-y">
    <table class="w-full table-fixed border-collapse text-left text-base">
      <thead>
        <tr>
          <th
            class="bg-surface border-border-hover sticky top-0 z-10 w-12 border-b py-1.5 pr-0 pl-6"
          >
            <input
              type="checkbox"
              checked={allSelected}
              onchange={toggleSelectAll}
              aria-label="Select all visible AI results"
              class="accent-accent h-3.5 w-3.5"
            />
          </th>
          <th
            class="label-micro bg-surface border-border-hover sticky top-0 z-10 w-[22%] border-b px-3 py-1.5 text-left"
          >
            Document
          </th>
          <th
            class="label-micro bg-surface border-border-hover sticky top-0 z-10 border-b px-3 py-1.5 text-left"
          >
            Suggested title
          </th>
          <th
            class="label-micro bg-surface border-border-hover sticky top-0 z-10 w-[10%] border-b px-3 py-1.5 text-left"
          >
            Fields
          </th>
          <th
            class="label-micro bg-surface border-border-hover sticky top-0 z-10 w-[22%] border-b px-3 py-1.5 text-left"
          >
            Confidence
          </th>
          <th
            class="label-micro bg-surface border-border-hover sticky top-0 z-10 w-[12%] border-b px-3 py-1.5 pr-4 text-right"
          >
            Actions
          </th>
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
  <div class="border-border divide-border divide-y border-y">
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
