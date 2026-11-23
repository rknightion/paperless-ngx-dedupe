<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { requestJson } from '$lib/api/client';
  import Button from '$lib/components/ui/Button.svelte';
  import { type FirstRunChecklistState } from '@paperless-dedupe/core';

  interface Props {
    /** Step conditions and the persisted dismissal, evaluated in core by the page load. */
    checklist: FirstRunChecklistState;
  }

  let { checklist }: Props = $props();

  let expanded = $state(false);
  let dismissing = $state(false);
  let dismissError = $state<string | null>(null);
  // Hides the completed row at once. A regressed step still reopens the checklist, and
  // the server copy is what makes the dismissal hold across browsers.
  let dismissedHere = $state(false);

  async function dismiss(): Promise<void> {
    if (dismissing) return;
    dismissing = true;
    dismissError = null;
    try {
      await requestJson(
        '/api/v1/dashboard/first-run-checklist',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dismissed: true }),
        },
        'dismiss first-run checklist',
      );
      dismissedHere = true;
      void invalidateAll().catch(() => undefined);
    } catch {
      dismissError = 'The checklist could not be dismissed. Please try again.';
    } finally {
      dismissing = false;
    }
  }

  // Each step has a real condition. A step that regresses (the connection
  // starts failing, analysis data is cleared) reopens the checklist on its own.
  const COPY = {
    connect: {
      title: '1. Connect to Paperless',
      detail: 'Confirm the connection in Settings.',
      href: '/settings',
      action: 'Open Settings',
    },
    sync: {
      title: '2. Sync your library',
      detail: 'Copy document metadata into the local review database.',
      href: '#next-actions-heading',
      action: 'Go to next actions',
    },
    analysis: {
      title: '3. Run duplicate analysis',
      detail: 'Review matches before any Paperless change.',
      href: '#next-actions-heading',
      action: 'Go to next actions',
    },
  } as const;

  const steps = $derived(checklist.steps.map((step) => ({ ...step, ...COPY[step.id] })));
  // A step that regressed after dismissal is named with the same words as its step.
  const regressedTitles = $derived(checklist.regressed.map((id) => COPY[id].title));

  const doneCount = $derived(checklist.doneCount);
  const allDone = $derived(checklist.allDone);
  const firstUnmet = $derived(steps.find((step) => !step.done));
  const showSteps = $derived(!allDone || expanded);
</script>

{#if checklist.visible && !(dismissedHere && allDone)}
  <section aria-label="First-run checklist" class="border-border bg-surface border">
    {#if allDone}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span class="status-word text-success">■ OK</span>
        <p class="text-base">
          Setup is complete. All three first-run steps are done, so the checklist is out of the way.
        </p>
        <span class="text-muted font-mono text-xs tabular-nums">{doneCount} / {steps.length}</span>
        <div class="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
            {expanded ? 'Hide steps' : 'Review steps'}
          </Button>
          <Button variant="ghost" size="sm" loading={dismissing} onclick={dismiss}>Dismiss</Button>
        </div>
      </div>
      {#if dismissError}
        <p class="text-ember border-border border-t px-4 py-2 text-sm" role="alert">
          {dismissError}
        </p>
      {/if}
    {:else}
      <div class="border-border flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 class="text-ink text-lg font-semibold">First-run checklist</h2>
          <p class="text-muted mt-1 text-sm">
            Work through these in order. Nothing here changes Paperless without your review.
          </p>
          {#if regressedTitles.length > 0}
            <p class="text-warn mt-1 text-sm" data-testid="first-run-regressed">
              Back because a step is no longer done: {regressedTitles.join(', ')}
            </p>
          {/if}
        </div>
        <span class="text-muted font-mono text-xs tabular-nums">{doneCount} / {steps.length}</span>
      </div>
    {/if}

    <!-- Collapsed steps stay in the document, hidden, so Review steps only reveals them. -->
    <ol
      id="first-run-steps"
      hidden={!showSteps}
      class="divide-border {allDone ? 'border-border border-t' : ''} divide-y"
    >
      {#each steps as step (step.id)}
        <li class="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
          <span class="status-word w-14 shrink-0 {step.done ? 'text-success' : 'text-warn'}">
            {step.done ? '■ DONE' : '◆ TODO'}
          </span>
          <div class="min-w-0 flex-1">
            <span class="text-ink text-base font-medium">{step.title}</span>
            <p class="text-muted mt-1 text-sm">{step.detail}</p>
          </div>
          {#if !allDone && firstUnmet?.id === step.id}
            <Button variant="secondary" href={step.href}>{step.action}</Button>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}
