<script lang="ts">
  import type { AutomationSettings, Readiness } from '@paperless-dedupe/core';
  import { CheckCircle2, CircleAlert, Database, Server } from 'lucide-svelte';

  interface Props {
    readiness: Readiness;
    automation?: AutomationSettings;
  }

  let { readiness, automation }: Props = $props();

  const paperlessConnected = $derived(readiness.paperless.status === 'connected');
  const localReady = $derived(readiness.lastSyncAt !== null);
  const analysisReady = $derived(localReady && !readiness.analysisStale);

  function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : 'Never';
  }
</script>

<section class="panel" aria-label="Readiness">
  <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
    <div>
      <h2 class="text-ink text-lg font-semibold">Readiness</h2>
      <p class="text-muted mt-1 text-sm">The checks that matter before you work through results.</p>
    </div>
    {#if paperlessConnected}
      <span class="bg-success-light text-success rounded-full px-2.5 py-1 text-xs font-medium"
        >Paperless connected{readiness.paperless.apiVersion
          ? ` · API ${readiness.paperless.apiVersion}`
          : ''}</span
      >
    {:else}
      <span class="bg-warn-light text-warn rounded-full px-2.5 py-1 text-xs font-medium"
        >Paperless unavailable</span
      >
    {/if}
  </div>

  <ul class="grid gap-3 sm:grid-cols-3">
    <li class="panel-inset flex min-w-0 items-start gap-3">
      <Server class="mt-0.5 h-4 w-4 shrink-0 {paperlessConnected ? 'text-success' : 'text-warn'}" />
      <div class="min-w-0">
        <p class="text-ink text-sm font-medium">Paperless</p>
        <p class="text-muted mt-0.5 text-xs">
          {paperlessConnected ? 'Connected and ready to sync' : 'Connection check is unavailable'}
        </p>
      </div>
    </li>
    <li class="panel-inset flex min-w-0 items-start gap-3">
      <Database class="mt-0.5 h-4 w-4 shrink-0 {localReady ? 'text-success' : 'text-warn'}" />
      <div class="min-w-0">
        <p class="text-ink text-sm font-medium">Library sync</p>
        <p class="text-muted mt-0.5 text-xs">Last sync: {formatDate(readiness.lastSyncAt)}</p>
      </div>
    </li>
    <li class="panel-inset flex min-w-0 items-start gap-3">
      {#if analysisReady}
        <CheckCircle2 class="text-success mt-0.5 h-4 w-4 shrink-0" />
      {:else}
        <CircleAlert class="text-warn mt-0.5 h-4 w-4 shrink-0" />
      {/if}
      <div class="min-w-0">
        <p class="text-ink text-sm font-medium">Duplicate analysis</p>
        <p class="text-muted mt-0.5 text-xs">
          {analysisReady
            ? `Current from ${formatDate(readiness.lastAnalysisAt)}`
            : 'Needs attention before reviewing results'}
        </p>
      </div>
    </li>
  </ul>
</section>

{#if automation}
  <section class="panel" aria-label="Automation next runs">
    <h2 class="text-ink text-lg font-semibold">Automation next runs</h2>
    <ul class="mt-3 grid gap-3 sm:grid-cols-3">
      {#each Object.values(automation.schedules) as schedule (schedule.task)}
        <li class="panel-inset">
          <p class="text-ink text-sm font-medium">
            {schedule.task === 'ai_processing'
              ? 'AI suggestions'
              : schedule.task === 'analysis'
                ? 'Analysis'
                : 'Sync'}
          </p>
          <p class="text-muted mt-1 text-xs">
            {schedule.enabled && schedule.nextRunAt
              ? new Date(schedule.nextRunAt).toLocaleString()
              : 'Not scheduled'}
          </p>
        </li>
      {/each}
    </ul>
  </section>
{/if}
