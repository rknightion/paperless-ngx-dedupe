<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { StatCard, JobStatusCard, EChart, ProgressBar } from '$lib/components';
  import { formatBytes } from '$lib/utils/format';
  import { connectJobSSE } from '$lib/sse';
  import { FileStack, AlertCircle, HardDrive, Clock } from 'lucide-svelte';
  import type { EChartsOption } from 'echarts';

  let { data } = $props();

  // Sync state
  let isSyncing = $state(false);
  let syncProgress = $state(0);
  let syncMessage = $state('');
  let syncForce = $state(false);
  let syncSSE: { close: () => void } | null = null;

  // Analysis state
  let isAnalyzing = $state(false);
  let analysisProgress = $state(0);
  let analysisMessage = $state('');
  let analysisForce = $state(false);
  let analysisSSE: { close: () => void } | null = null;

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  }

  async function startSync() {
    isSyncing = true;
    syncProgress = 0;
    syncMessage = 'Starting sync...';
    try {
      const res = await fetch('/api/v1/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: syncForce }),
      });
      const json = await res.json();
      if (!res.ok) {
        syncMessage = json.error?.message ?? 'Failed to start sync';
        isSyncing = false;
        return;
      }
      syncSSE = connectJobSSE(json.data.jobId, {
        onProgress: (d) => {
          syncProgress = d.progress;
          syncMessage = d.message ?? '';
        },
        onComplete: () => {
          isSyncing = false;
          syncProgress = 1;
          syncMessage = 'Sync complete';
          invalidateAll();
        },
        onError: () => {
          isSyncing = false;
          syncMessage = 'Connection lost';
        },
      });
    } catch {
      isSyncing = false;
      syncMessage = 'Failed to start sync';
    }
  }

  async function startAnalysis() {
    isAnalyzing = true;
    analysisProgress = 0;
    analysisMessage = 'Starting analysis...';
    try {
      const res = await fetch('/api/v1/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: analysisForce }),
      });
      const json = await res.json();
      if (!res.ok) {
        analysisMessage = json.error?.message ?? 'Failed to start analysis';
        isAnalyzing = false;
        return;
      }
      analysisSSE = connectJobSSE(json.data.jobId, {
        onProgress: (d) => {
          analysisProgress = d.progress;
          analysisMessage = d.message ?? '';
        },
        onComplete: () => {
          isAnalyzing = false;
          analysisProgress = 1;
          analysisMessage = 'Analysis complete';
          invalidateAll();
        },
        onError: () => {
          isAnalyzing = false;
          analysisMessage = 'Connection lost';
        },
      });
    } catch {
      isAnalyzing = false;
      analysisMessage = 'Failed to start analysis';
    }
  }

  // Check for in-progress jobs on mount
  async function checkActiveJobs() {
    try {
      const [syncRes, analysisRes] = await Promise.all([
        fetch('/api/v1/sync/status'),
        fetch('/api/v1/analysis/status'),
      ]);
      const syncStatus = await syncRes.json();
      const analysisStatus = await analysisRes.json();

      if (syncStatus.data?.isSyncing && syncStatus.data?.currentJobId) {
        isSyncing = true;
        syncMessage = 'Sync in progress...';
        syncSSE = connectJobSSE(syncStatus.data.currentJobId, {
          onProgress: (d) => {
            syncProgress = d.progress;
            syncMessage = d.message ?? '';
          },
          onComplete: () => {
            isSyncing = false;
            syncProgress = 1;
            syncMessage = 'Sync complete';
            invalidateAll();
          },
          onError: () => {
            isSyncing = false;
            syncMessage = 'Connection lost';
          },
        });
      }

      if (analysisStatus.data?.isAnalyzing && analysisStatus.data?.currentJobId) {
        isAnalyzing = true;
        analysisMessage = 'Analysis in progress...';
        analysisSSE = connectJobSSE(analysisStatus.data.currentJobId, {
          onProgress: (d) => {
            analysisProgress = d.progress;
            analysisMessage = d.message ?? '';
          },
          onComplete: () => {
            isAnalyzing = false;
            analysisProgress = 1;
            analysisMessage = 'Analysis complete';
            invalidateAll();
          },
          onError: () => {
            isAnalyzing = false;
            analysisMessage = 'Connection lost';
          },
        });
      }
    } catch {
      // Ignore status check errors
    }
  }

  $effect(() => {
    checkActiveJobs();
    return () => {
      syncSSE?.close();
      analysisSSE?.close();
    };
  });

  // Chart option for confidence distribution
  let chartOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.duplicateStats.confidenceDistribution.map((b) => b.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', name: 'Groups' },
    series: [
      {
        type: 'bar',
        data: data.duplicateStats.confidenceDistribution.map((b) => ({
          value: b.count,
          itemStyle: {
            color:
              b.label.startsWith('95') || b.label.startsWith('90')
                ? 'oklch(0.55 0.15 155)' // green for 90%+
                : b.label.startsWith('85') || b.label.startsWith('80')
                  ? 'oklch(0.7 0.15 85)' // yellow for 80-90%
                  : b.label.startsWith('75')
                    ? 'oklch(0.6 0.15 55)' // orange for 75-80%
                    : 'oklch(0.55 0.2 25)', // red for below 75%
          },
        })),
        barMaxWidth: 40,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });
</script>

<svelte:head>
  <title>Dashboard - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <header class="space-y-1">
    <h1 class="text-ink text-2xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-muted text-sm">Overview of your document library and deduplication status.</p>
  </header>

  <!-- Stat Cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Total Documents" value={data.dashboard.totalDocuments.toLocaleString()}>
      {#snippet icon()}<FileStack class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard label="Pending Groups" value={data.dashboard.pendingGroups.toLocaleString()}>
      {#snippet icon()}<AlertCircle class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard label="Storage Savings" value={formatBytes(data.dashboard.storageSavingsBytes)}>
      {#snippet icon()}<HardDrive class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard label="Pending Analysis" value={data.dashboard.pendingAnalysis.toLocaleString()}>
      {#snippet icon()}<Clock class="h-5 w-5" />{/snippet}
    </StatCard>
  </div>

  <!-- Controls Row -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Sync Controls -->
    <div class="panel border-l-accent border-l-4">
      <h2 class="text-ink text-lg font-semibold">Sync Documents</h2>
      <p class="text-muted mt-1 text-sm">Pull latest documents from Paperless-NGX.</p>
      <div class="mt-4 flex items-center gap-4">
        <button
          onclick={startSync}
          disabled={isSyncing}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {#if isSyncing}
            <span class="flex items-center gap-2">
              <span
                class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              ></span>
              Syncing...
            </span>
          {:else}
            Sync Now
          {/if}
        </button>
        <label class="text-muted flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={syncForce} class="rounded" />
          Force Full Sync
        </label>
      </div>
      {#if isSyncing}
        <div class="mt-4">
          <ProgressBar progress={syncProgress} message={syncMessage} />
        </div>
      {/if}
      <div class="text-muted mt-3 text-xs">
        Last sync: {formatDate(data.dashboard.lastSyncAt)}
        {#if data.dashboard.lastSyncDocumentCount != null}
          &middot;
          {#if data.dashboard.lastSyncDocumentCount === 0}
            No changes
          {:else}
            {data.dashboard.lastSyncDocumentCount} documents changed
          {/if}
        {/if}
      </div>
    </div>

    <!-- Analysis Controls -->
    <div class="panel border-l-accent border-l-4">
      <h2 class="text-ink text-lg font-semibold">Duplicate Analysis</h2>
      <p class="text-muted mt-1 text-sm">Run deduplication analysis on synced documents.</p>
      <div class="mt-4 flex items-center gap-4">
        <button
          onclick={startAnalysis}
          disabled={isAnalyzing}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {#if isAnalyzing}
            <span class="flex items-center gap-2">
              <span
                class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              ></span>
              Analyzing...
            </span>
          {:else}
            Run Analysis
          {/if}
        </button>
        <label class="text-muted flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={analysisForce} class="rounded" />
          Force Rebuild
        </label>
      </div>
      {#if isAnalyzing}
        <div class="mt-4">
          <ProgressBar progress={analysisProgress} message={analysisMessage} />
        </div>
      {/if}
      <div class="text-muted mt-3 text-xs">
        Last analysis: {formatDate(data.dashboard.lastAnalysisAt)}
        {#if data.dashboard.totalDuplicateGroups != null}
          &middot; {data.dashboard.totalDuplicateGroups} groups found
        {/if}
      </div>
    </div>
  </div>

  <!-- Recent Jobs -->
  {#if data.jobs.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Recent Jobs</h2>
      <div class="space-y-3">
        {#each data.jobs as j (j.id)}
          <JobStatusCard
            type={j.type}
            status={j.status ?? 'pending'}
            progress={j.progress ?? 0}
            progressMessage={j.progressMessage}
            startedAt={j.startedAt}
            completedAt={j.completedAt}
            errorMessage={j.errorMessage}
            resultJson={j.resultJson}
          />
        {/each}
      </div>
    </div>
  {/if}

  <!-- Quick Stats -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Top Correspondents -->
    {#if data.dashboard.topCorrespondents.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Top Duplicated Correspondents</h2>
        <ul class="space-y-3">
          {#each data.dashboard.topCorrespondents as c (c.correspondent)}
            {@const maxCount = data.dashboard.topCorrespondents[0]?.groupCount ?? 1}
            <li class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span class="text-ink">{c.correspondent}</span>
                <span class="text-muted font-mono text-xs">{c.groupCount} groups</span>
              </div>
              <div class="bg-canvas-deep h-2 overflow-hidden rounded-full">
                <div
                  class="bg-accent h-full rounded-full transition-all duration-300"
                  style="width: {(c.groupCount / maxCount) * 100}%"
                ></div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Confidence Distribution Chart -->
    {#if data.duplicateStats.confidenceDistribution.some((b) => b.count > 0)}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Confidence Distribution</h2>
        <EChart option={chartOption} height="250px" />
      </div>
    {/if}
  </div>
</div>
