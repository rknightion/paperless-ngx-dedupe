<script lang="ts">
  import type { AutomationSettings, Readiness } from '@paperless-dedupe/core';

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

<section class="border-border bg-surface border" aria-label="Readiness">
  <div class="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
    <div>
      <h2 class="text-ink text-lg font-semibold">Readiness</h2>
      <p class="text-muted mt-1 text-sm">The checks that matter before you work through results.</p>
    </div>
    {#if paperlessConnected}
      <span class="status-word text-success">
        ■ Paperless connected{readiness.paperless.apiVersion
          ? ` · API ${readiness.paperless.apiVersion}`
          : ''}
      </span>
    {:else}
      <span class="status-word text-warn">◆ Paperless unavailable</span>
    {/if}
  </div>

  <ul class="bg-border grid gap-px sm:grid-cols-3">
    <li class="bg-surface min-w-0 px-4 py-3">
      <span class="status-word {paperlessConnected ? 'text-success' : 'text-warn'}">
        {paperlessConnected ? '■ OK' : '◆ WARN'}
      </span>
      <p class="text-ink mt-1 text-base font-medium">Paperless</p>
      <p class="text-muted mt-0.5 text-sm">
        {paperlessConnected ? 'Connected and ready to sync' : 'Connection check is unavailable'}
      </p>
    </li>
    <li class="bg-surface min-w-0 px-4 py-3">
      <span class="status-word {localReady ? 'text-success' : 'text-warn'}">
        {localReady ? '■ OK' : '◆ WARN'}
      </span>
      <p class="text-ink mt-1 text-base font-medium">Library sync</p>
      <p class="text-muted mt-0.5 text-sm">Last sync: {formatDate(readiness.lastSyncAt)}</p>
    </li>
    <li class="bg-surface min-w-0 px-4 py-3">
      <span class="status-word {analysisReady ? 'text-success' : 'text-warn'}">
        {analysisReady ? '■ OK' : '◆ WARN'}
      </span>
      <p class="text-ink mt-1 text-base font-medium">Duplicate analysis</p>
      <p class="text-muted mt-0.5 text-sm">
        {analysisReady
          ? `Current from ${formatDate(readiness.lastAnalysisAt)}`
          : 'Needs attention before reviewing results'}
      </p>
    </li>
  </ul>
</section>

{#if automation}
  <section class="border-border bg-surface border" aria-label="Automation next runs">
    <h2 class="text-ink border-border border-b px-4 py-3 text-lg font-semibold">
      Automation next runs
    </h2>
    <ul class="bg-border grid gap-px sm:grid-cols-3">
      {#each Object.values(automation.schedules) as schedule (schedule.task)}
        <li class="bg-surface px-4 py-3">
          <p class="text-ink text-base font-medium">
            {schedule.task === 'ai_processing'
              ? 'AI suggestions'
              : schedule.task === 'analysis'
                ? 'Analysis'
                : 'Sync'}
          </p>
          <p class="text-muted mt-1 font-mono text-xs tabular-nums">
            {schedule.enabled && schedule.nextRunAt
              ? new Date(schedule.nextRunAt).toLocaleString()
              : 'Not scheduled'}
          </p>
        </li>
      {/each}
    </ul>
  </section>
{/if}
