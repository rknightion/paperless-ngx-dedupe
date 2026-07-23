<script lang="ts">
  import type { NextAction } from '@paperless-dedupe/core';
  import { ArrowRight, Play, RefreshCw } from 'lucide-svelte';

  interface Props {
    actions: NextAction[];
    syncDisabled: boolean;
    analysisDisabled: boolean;
    onSync: () => void;
    onAnalysis: () => void;
  }

  let { actions, syncDisabled, analysisDisabled, onSync, onAnalysis }: Props = $props();

  const orderedActions = $derived(
    [...actions].sort((left, right) => right.priority - left.priority),
  );
  const includesSync = $derived(actions.some((action) => action.safeAction === 'sync'));
  const includesAnalysis = $derived(actions.some((action) => action.safeAction === 'analysis'));
</script>

<section class="panel" aria-labelledby="next-actions-heading">
  <div class="mb-4">
    <h2 id="next-actions-heading" class="text-ink text-lg font-semibold">Next actions</h2>
    <p class="text-muted mt-1 text-sm">
      Start with the highest-impact work, then use the links for detail.
    </p>
  </div>

  {#if orderedActions.length > 0}
    <ol class="space-y-3">
      {#each orderedActions as action (action.id)}
        <li
          class="panel-inset flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid="next-action"
          data-action-id={action.id}
        >
          <div class="min-w-0">
            <h3 class="text-ink text-sm font-semibold">{action.title}</h3>
            <p class="text-muted mt-1 text-sm">{action.detail}</p>
          </div>
          <div class="shrink-0">
            {#if action.safeAction === 'sync'}
              <button
                type="button"
                onclick={onSync}
                disabled={syncDisabled}
                aria-describedby={syncDisabled ? 'sync-active-help' : undefined}
                class="bg-accent hover:bg-accent-hover inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw class="h-4 w-4" /> Sync Now
              </button>
              {#if syncDisabled}
                <p id="sync-active-help" class="text-muted mt-2 text-xs" role="status">
                  A sync is already active. Follow its progress in Current activity.
                </p>
              {/if}
            {:else if action.safeAction === 'analysis'}
              <button
                type="button"
                onclick={onAnalysis}
                disabled={analysisDisabled}
                aria-describedby={analysisDisabled ? 'analysis-active-help' : undefined}
                class="bg-accent hover:bg-accent-hover inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play class="h-4 w-4" /> Run Analysis
              </button>
              {#if analysisDisabled}
                <p id="analysis-active-help" class="text-muted mt-2 text-xs" role="status">
                  Duplicate analysis is already active. Follow its progress in Current activity.
                </p>
              {/if}
            {:else}
              <a
                href={action.href}
                class="text-accent hover:text-accent-hover inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium"
              >
                Review <ArrowRight class="h-4 w-4" />
              </a>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="panel-inset text-muted text-sm">Your library is ready for review.</p>
  {/if}

  {#if !includesSync || !includesAnalysis}
    <div
      class="border-soft mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h3 class="text-ink text-sm font-semibold">Run a safe update</h3>
        <p class="text-muted mt-1 text-sm">
          Sync new documents or refresh duplicate analysis when needed.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#if !includesSync}
          <button
            type="button"
            onclick={onSync}
            disabled={syncDisabled}
            aria-describedby={syncDisabled ? 'sync-active-help' : undefined}
            class="border-soft text-ink hover:bg-canvas-deep inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw class="h-4 w-4" /> Sync Now
          </button>
          {#if syncDisabled}
            <p id="sync-active-help" class="text-muted mt-2 text-xs" role="status">
              A sync is already active. Follow its progress in Current activity.
            </p>
          {/if}
        {/if}
        {#if !includesAnalysis}
          <button
            type="button"
            onclick={onAnalysis}
            disabled={analysisDisabled}
            aria-describedby={analysisDisabled ? 'analysis-active-help' : undefined}
            class="border-soft text-ink hover:bg-canvas-deep inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play class="h-4 w-4" /> Run Analysis
          </button>
          {#if analysisDisabled}
            <p id="analysis-active-help" class="text-muted mt-2 text-xs" role="status">
              Duplicate analysis is already active. Follow its progress in Current activity.
            </p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</section>
