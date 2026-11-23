<script lang="ts">
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import type { ModelCostEstimate } from '@paperless-dedupe/core';

  interface Props {
    open: boolean;
    documentCount: number;
    allModels: ModelCostEstimate[];
    currentModelId: string;
    reasoningEffort: string;
    onclose: () => void;
  }

  let { open, documentCount, allModels, currentModelId, reasoningEffort, onclose }: Props =
    $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  const openaiModels = $derived(allModels.filter((m) => m.provider === 'openai'));

  function formatCost(usd: number): string {
    if (usd < 0.001) return '<$0.001';
    if (usd < 0.01) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatPerDoc(usd: number): string {
    if (usd < 0.0001) return '<$0.0001/doc';
    return `$${usd.toFixed(4)}/doc`;
  }

  function cacheSavings(model: ModelCostEstimate): string {
    if (!model.hasCachePricing) return '--';
    const savings = model.worstCase.totalCostUsd - model.bestCase.totalCostUsd;
    if (savings < 0.001) return '--';
    const pct = (savings / model.worstCase.totalCostUsd) * 100;
    return `${pct.toFixed(0)}%`;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
  class="border-border-hover bg-surface-raised backdrop:bg-ink/50 m-auto w-full max-w-2xl rounded-md border p-0 shadow-lg backdrop:transition-opacity backdrop:duration-200"
  aria-labelledby="cost-comparison-title"
>
  <div class="flex max-h-[80vh] flex-col">
    <!-- Header -->
    <div class="border-border flex items-start justify-between border-b px-6 py-4">
      <div>
        <h2 id="cost-comparison-title" class="text-ink text-lg font-semibold">Cost comparison</h2>
        <p class="text-muted mt-1 text-sm">
          {documentCount.toLocaleString()} unprocessed document{documentCount === 1 ? '' : 's'},
          {reasoningEffort} reasoning
        </p>
      </div>
      <button
        onclick={onclose}
        class="text-muted hover:text-ink -mt-1 -mr-1 p-1.5 transition-colors"
      >
        <XIcon class="h-4 w-4" />
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-6 py-5">
      {#each [{ label: 'OpenAI', models: openaiModels }] as group (group.label)}
        {#if group.models.length > 0}
          <div class="mb-5 last:mb-0">
            <h3 class="label-micro mb-2">
              {group.label}
            </h3>
            <div class="border-border overflow-hidden border">
              <table class="w-full">
                <thead>
                  <tr class="border-border-hover border-b">
                    <th class="text-muted px-4 py-2.5 text-left text-xs font-medium">Model</th>
                    <th class="text-muted px-4 py-2.5 text-right text-xs font-medium">Best case</th>
                    <th class="text-muted px-4 py-2.5 text-right text-xs font-medium">
                      Worst case
                    </th>
                    <th class="text-muted px-4 py-2.5 text-right text-xs font-medium">
                      Cache savings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.models as model (model.modelId)}
                    {@const isCurrent = model.modelId === currentModelId}
                    <tr
                      class="border-border border-b last:border-b-0 {isCurrent
                        ? 'bg-selected'
                        : ''}"
                    >
                      <td class="px-4 py-3">
                        <span class="text-ink text-sm font-medium">{model.modelName}</span>
                        {#if isCurrent}
                          <span class="text-muted ml-1.5 font-mono text-xs">current</span>
                        {/if}
                      </td>
                      <td class="px-4 py-3 text-right">
                        <span class="text-ink text-sm font-medium tabular-nums">
                          {formatCost(model.bestCase.totalCostUsd)}
                        </span>
                        <span class="text-muted block text-xs tabular-nums">
                          {formatPerDoc(model.bestCase.perDocumentCostUsd)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right">
                        <span class="text-ink text-sm font-medium tabular-nums">
                          {formatCost(model.worstCase.totalCostUsd)}
                        </span>
                        <span class="text-muted block text-xs tabular-nums">
                          {formatPerDoc(model.worstCase.perDocumentCostUsd)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right">
                        <span
                          class="text-sm tabular-nums {cacheSavings(model) !== '--'
                            ? 'text-success font-medium'
                            : 'text-muted'}"
                        >
                          {cacheSavings(model)}
                        </span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      {/each}

      <p class="text-muted mt-4 text-xs leading-relaxed">
        Best case assumes prompt caching is fully effective after the first request. Worst case
        assumes no caching. Actual costs depend on API provider caching behavior and may vary.
      </p>
    </div>

    <!-- Footer -->
    <div class="border-border flex items-center justify-end border-t px-6 py-4">
      <button
        onclick={onclose}
        class="border-border text-ink hover:bg-canvas-deep h-7 rounded-sm border px-3 text-sm font-medium"
      >
        Close
      </button>
    </div>
  </div>
</dialog>
