<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    paperlessConnected: boolean;
    synced: boolean;
    analysed: boolean;
  }

  let { paperlessConnected, synced, analysed }: Props = $props();

  let expanded = $state(false);

  // Each step has a real condition. A step that regresses (the connection
  // starts failing, analysis data is cleared) reopens the checklist on its own.
  const steps = $derived([
    {
      id: 'connect',
      title: '1. Connect to Paperless',
      detail: 'Confirm the connection in Settings.',
      done: paperlessConnected,
      href: '/settings',
      action: 'Open Settings',
    },
    {
      id: 'sync',
      title: '2. Sync your library',
      detail: 'Copy document metadata into the local review database.',
      done: synced,
      href: '#next-actions-heading',
      action: 'Go to next actions',
    },
    {
      id: 'analysis',
      title: '3. Run duplicate analysis',
      detail: 'Review matches before any Paperless change.',
      done: analysed,
      href: '#next-actions-heading',
      action: 'Go to next actions',
    },
  ]);

  const doneCount = $derived(steps.filter((step) => step.done).length);
  const allDone = $derived(doneCount === steps.length);
  const firstUnmet = $derived(steps.find((step) => !step.done));
  const showSteps = $derived(!allDone || expanded);
</script>

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
      </div>
    </div>
  {:else}
    <div class="border-border flex items-baseline justify-between gap-3 border-b px-4 py-3">
      <div>
        <h2 class="text-ink text-lg font-semibold">First-run checklist</h2>
        <p class="text-muted mt-1 text-sm">
          Work through these in order. Nothing here changes Paperless without your review.
        </p>
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
