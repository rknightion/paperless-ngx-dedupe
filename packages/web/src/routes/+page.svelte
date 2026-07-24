<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import { requestJson } from '$lib/api/client';
  import CompactTrends from '$lib/components/dashboard/CompactTrends.svelte';
  import NextActions from '$lib/components/dashboard/NextActions.svelte';
  import OutcomeSummary from '$lib/components/dashboard/OutcomeSummary.svelte';
  import ReadinessStrip from '$lib/components/dashboard/ReadinessStrip.svelte';
  import {
    trackAnalysisFailed,
    trackAnalysisStarted,
    trackSyncFailed,
    trackSyncStarted,
  } from '$lib/faro-events';
  import { Activity, CircleAlert } from 'lucide-svelte';

  let { data } = $props();

  type SafeAction = 'sync' | 'analysis';
  type JobStartResponse = { jobId?: unknown };

  let startingAction = $state<SafeAction | null>(null);
  let actionError = $state<string | null>(null);

  const currentActivity = $derived(
    activity.jobs.filter((job) => !['completed', 'failed', 'cancelled'].includes(job.status)),
  );
  const syncDisabled = $derived(startingAction === 'sync' || hasActiveJob('sync'));
  const analysisDisabled = $derived(startingAction === 'analysis' || hasActiveJob('analysis'));

  function hasActiveJob(type: SafeAction): boolean {
    return activity.jobs.some(
      (job) =>
        job.type.toLowerCase() === type &&
        !['completed', 'failed', 'cancelled'].includes(job.status),
    );
  }

  function jobLabel(type: string): string {
    return type.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function jobIdFrom(response: JobStartResponse): string | null {
    return typeof response.jobId === 'string' && response.jobId.trim().length > 0
      ? response.jobId.trim()
      : null;
  }

  function refreshAfterStart(): void {
    void invalidateAll().catch(() => undefined);
  }

  async function startSync(): Promise<void> {
    if (syncDisabled) return;
    startingAction = 'sync';
    actionError = null;
    trackSyncStarted({ force: false, purge: false });

    try {
      const response = await requestJson<JobStartResponse>(
        '/api/v1/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false, purge: false }),
        },
        'start sync',
      );
      const jobId = jobIdFrom(response);
      if (!jobId) {
        actionError = 'The sync could not be started. Please try again.';
        trackSyncFailed(actionError);
        return;
      }

      activity.track(jobId);
      refreshAfterStart();
    } catch {
      actionError = 'The sync could not be started. Please try again.';
      trackSyncFailed(actionError);
    } finally {
      startingAction = null;
    }
  }

  async function startAnalysis(): Promise<void> {
    if (analysisDisabled) return;
    startingAction = 'analysis';
    actionError = null;
    const force = data.dashboard.analysisStale;
    trackAnalysisStarted({ force });

    try {
      const response = await requestJson<JobStartResponse>(
        '/api/v1/analysis',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        },
        'start duplicate analysis',
      );
      const jobId = jobIdFrom(response);
      if (!jobId) {
        actionError = 'Duplicate analysis could not be started. Please try again.';
        trackAnalysisFailed(actionError);
        return;
      }

      activity.track(jobId);
      refreshAfterStart();
    } catch {
      actionError = 'Duplicate analysis could not be started. Please try again.';
      trackAnalysisFailed(actionError);
    } finally {
      startingAction = null;
    }
  }
</script>

<svelte:head>
  <title>Dashboard - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <header class="space-y-1">
    <h1 class="text-ink text-2xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-muted text-sm">
      Start with readiness, then move through the work that needs you.
    </p>
  </header>

  <ReadinessStrip readiness={data.readiness} automation={data.automation} />

  <NextActions
    actions={data.dashboard.nextActions}
    {syncDisabled}
    {analysisDisabled}
    onSync={startSync}
    onAnalysis={startAnalysis}
  />

  {#if actionError}
    <div
      class="border-ember-light bg-ember-light/40 text-ember flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
      role="alert"
    >
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />
      <p>{actionError}</p>
    </div>
  {/if}

  <section class="panel" aria-label="Current activity">
    <div class="mb-4 flex items-center gap-2">
      <Activity class="text-accent h-5 w-5" />
      <div>
        <h2 class="text-ink text-lg font-semibold">Current activity</h2>
        <p class="text-muted mt-1 text-sm">Live updates continue if you navigate elsewhere.</p>
      </div>
    </div>
    {#if currentActivity.length > 0}
      <ul class="space-y-3">
        {#each currentActivity as job (job.id)}
          <li class="panel-inset" data-testid={`dashboard-activity-${job.id}`}>
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-ink text-sm font-medium">{jobLabel(job.type)}</p>
                <p class="text-muted mt-1 text-xs">{job.message || 'Waiting for an update'}</p>
              </div>
              <span class="text-muted shrink-0 text-xs capitalize"
                >{job.connection === 'degraded' ? 'Updates delayed' : job.status}</span
              >
            </div>
            <div class="bg-canvas-deep mt-3 h-2 overflow-hidden rounded-full" aria-hidden="true">
              <div
                class="bg-accent h-full rounded-full"
                style={`width: ${Math.round(job.progress * 100)}%`}
              ></div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="panel-inset text-muted text-sm">Nothing is running right now.</p>
    {/if}
  </section>

  <OutcomeSummary dashboard={data.dashboard} jobs={data.jobs} aiStats={data.aiStats} />

  <CompactTrends
    topCorrespondents={data.dashboard.topCorrespondents}
    confidenceDistribution={data.duplicateStats.confidenceDistribution}
  />
</div>
