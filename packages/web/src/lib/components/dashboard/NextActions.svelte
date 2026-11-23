<script lang="ts">
  import type { NextAction } from '@paperless-dedupe/core';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import Button from '$lib/components/ui/Button.svelte';

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

<section aria-labelledby="next-actions-heading">
  <h2 id="next-actions-heading" class="text-ink text-lg font-semibold">Next actions</h2>
  <p class="text-muted mt-0.5 text-sm">
    Start with the highest-impact work, then use the links for detail.
  </p>

  <div class="border-border bg-surface mt-3 border">
    {#if orderedActions.length > 0}
      <ol class="divide-border divide-y">
        <!-- One primary action for the region: the highest-priority row is primary. -->
        {#each orderedActions as action, index (action.id)}
          {@const variant = index === 0 ? 'primary' : 'secondary'}
          <li
            class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            data-testid="next-action"
            data-action-id={action.id}
          >
            <span class="status-word text-warn shrink-0 sm:w-14">◆ WARN</span>
            <div class="min-w-0 flex-1">
              <h3 class="text-ink text-base font-medium">{action.title}</h3>
              <p class="text-muted text-sm">{action.detail}</p>
            </div>
            <div class="shrink-0">
              {#if action.safeAction === 'sync'}
                <Button
                  {variant}
                  icon={ArrowsClockwiseIcon}
                  disabled={syncDisabled}
                  describedBy={syncDisabled ? 'sync-active-help' : undefined}
                  onclick={onSync}
                >
                  Sync Now
                </Button>
                {#if syncDisabled}
                  <p id="sync-active-help" class="text-muted mt-2 text-xs" role="status">
                    A sync is already active. Follow its progress in Current activity.
                  </p>
                {/if}
              {:else if action.safeAction === 'analysis'}
                <Button
                  {variant}
                  icon={PlayIcon}
                  disabled={analysisDisabled}
                  describedBy={analysisDisabled ? 'analysis-active-help' : undefined}
                  onclick={onAnalysis}
                >
                  Run Analysis
                </Button>
                {#if analysisDisabled}
                  <p id="analysis-active-help" class="text-muted mt-2 text-xs" role="status">
                    Duplicate analysis is already active. Follow its progress in Current activity.
                  </p>
                {/if}
              {:else}
                <Button {variant} href={action.href}>Review</Button>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="text-muted px-4 py-3 text-sm">Your library is ready for review.</p>
    {/if}

    {#if !includesSync || !includesAnalysis}
      <div
        class="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h3 class="text-ink text-base font-medium">Run a safe update</h3>
          <p class="text-muted text-sm">
            Sync new documents or refresh duplicate analysis when needed.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if !includesSync}
            <Button
              variant="secondary"
              icon={ArrowsClockwiseIcon}
              disabled={syncDisabled}
              describedBy={syncDisabled ? 'sync-active-help' : undefined}
              onclick={onSync}
            >
              Sync Now
            </Button>
            {#if syncDisabled}
              <p id="sync-active-help" class="text-muted mt-2 text-xs" role="status">
                A sync is already active. Follow its progress in Current activity.
              </p>
            {/if}
          {/if}
          {#if !includesAnalysis}
            <Button
              variant="secondary"
              icon={PlayIcon}
              disabled={analysisDisabled}
              describedBy={analysisDisabled ? 'analysis-active-help' : undefined}
              onclick={onAnalysis}
            >
              Run Analysis
            </Button>
            {#if analysisDisabled}
              <p id="analysis-active-help" class="text-muted mt-2 text-xs" role="status">
                Duplicate analysis is already active. Follow its progress in Current activity.
              </p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>
