<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import { requestJson } from '$lib/api/client';
  import JobMeter from '$lib/components/activity/JobMeter.svelte';
  import {
    jobDisplayName,
    jobProgressPercent,
    jobStatusWord,
  } from '$lib/components/activity/job-status';
  import CompactTrends from '$lib/components/dashboard/CompactTrends.svelte';
  import FirstRunChecklist from '$lib/components/dashboard/FirstRunChecklist.svelte';
  import NextActions from '$lib/components/dashboard/NextActions.svelte';
  import OutcomeSummary from '$lib/components/dashboard/OutcomeSummary.svelte';
  import ReadinessStrip from '$lib/components/dashboard/ReadinessStrip.svelte';
  import StatStrip from '$lib/components/dashboard/StatStrip.svelte';
  import {
    trackAnalysisFailed,
    trackAnalysisStarted,
    trackSyncFailed,
    trackSyncStarted,
  } from '$lib/faro-events';

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

<!-- The shell's main region pads its content; the title row and the stat strip
     run edge to edge, so this cancels that padding and re-applies it below. -->
<div class="-m-3 md:-m-6">
  <header
    class="border-border bg-surface flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2.5 md:px-6"
  >
    <h1 class="text-ink text-xl font-semibold">Dashboard</h1>
    <p class="text-muted text-sm">
      Start with readiness, then move through the work that needs you.
    </p>
  </header>

  <StatStrip
    totalDocuments={data.dashboard.totalDocuments}
    pendingGroups={data.dashboard.pendingGroups}
    totalDuplicateGroups={data.dashboard.totalDuplicateGroups}
    pendingAnalysis={data.dashboard.pendingAnalysis}
    reclaimableBytes={data.duplicateStats.reclaimableBytes}
  />

  <div class="flex flex-col gap-6 px-3 pt-5 pb-8 md:px-6">
    <FirstRunChecklist
      paperlessConnected={data.readiness.paperless.status === 'connected'}
      synced={data.readiness.lastSyncAt !== null}
      analysed={data.readiness.lastAnalysisAt !== null}
    />

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
        class="border-ember flex items-baseline gap-3 border bg-[color-mix(in_oklab,var(--color-ember)_7%,var(--color-surface))] px-4 py-3 text-base"
        role="alert"
      >
        <span class="status-word text-ember">● FAIL</span>
        <p class="text-ink">{actionError}</p>
      </div>
    {/if}

    <section aria-label="Current activity">
      <h2 class="text-ink text-lg font-semibold">Current activity</h2>
      <p class="text-muted mt-0.5 text-sm">Live updates continue if you navigate elsewhere.</p>
      <div class="border-border bg-surface mt-3 border">
        {#if currentActivity.length > 0}
          <ul class="divide-border divide-y">
            {#each currentActivity as job (job.id)}
              {@const word = jobStatusWord(job)}
              {@const percent = jobProgressPercent(job.progress)}
              <li class="px-4 py-3" data-testid={`dashboard-activity-${job.id}`}>
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span class="status-word {word.tone} uppercase">{word.shape} {word.label}</span>
                  <span class="text-ink text-base font-medium">{jobDisplayName(job.type)}</span>
                  <span class="text-muted min-w-0 text-sm">
                    {job.message || 'Waiting for an update'}
                  </span>
                  <span
                    class="ml-auto font-mono text-sm tabular-nums {percent > 0
                      ? 'text-ink'
                      : 'text-muted'}"
                  >
                    {percent}%
                  </span>
                </div>
                <div class="mt-2">
                  <JobMeter progress={job.progress} status={job.status} />
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted px-4 py-3 text-sm">Nothing is running right now.</p>
        {/if}
      </div>
    </section>

    <OutcomeSummary dashboard={data.dashboard} jobs={data.jobs} aiStats={data.aiStats} />

    <CompactTrends
      topCorrespondents={data.dashboard.topCorrespondents}
      confidenceDistribution={data.duplicateStats.confidenceDistribution}
    />
  </div>
</div>
