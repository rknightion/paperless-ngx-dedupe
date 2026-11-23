<script lang="ts">
  import { JobStatusCard } from '$lib/components';

  interface Dashboard {
    lastSyncDocumentCount: number | null;
    totalDuplicateGroups: number | null;
  }

  interface Job {
    id: string;
    type: string;
    status: string | null;
    progress: number | null;
    phaseProgress: number | null;
    progressMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    resultJson: string | null;
  }

  interface AiStats {
    pendingReview: number;
    failed: number;
    unprocessed: number;
    applied: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
  }

  interface Props {
    dashboard: Dashboard;
    jobs: Job[];
    aiStats: AiStats | null;
  }

  let { dashboard, jobs, aiStats }: Props = $props();
  const totalTokens = $derived(
    aiStats ? aiStats.totalPromptTokens + aiStats.totalCompletionTokens : 0,
  );

  const aiCell = 'bg-surface px-4 py-3';
  const aiLinkCell = `${aiCell} text-ink hover:bg-canvas-deep block`;
</script>

<section aria-labelledby="outcome-summary-heading" class="space-y-4">
  <div>
    <h2 id="outcome-summary-heading" class="text-ink text-lg font-semibold">Outcome summary</h2>
    <p class="text-muted mt-0.5 text-sm">A compact view of the work completed and still waiting.</p>
  </div>

  <div class="border-border bg-border grid gap-px border sm:grid-cols-2">
    <div class="bg-surface px-4 py-3">
      <p class="label-micro">Last sync outcome</p>
      <p class="text-ink mt-1 text-base">
        {#if dashboard.lastSyncDocumentCount === null}
          No previous sync outcome
        {:else if dashboard.lastSyncDocumentCount === 0}
          No changes
        {:else}
          {dashboard.lastSyncDocumentCount.toLocaleString()} documents changed
        {/if}
      </p>
    </div>
    <div class="bg-surface px-4 py-3">
      <p class="label-micro">Latest duplicate analysis</p>
      <p class="text-ink mt-1 text-base">
        {dashboard.totalDuplicateGroups === null
          ? 'No completed analysis yet'
          : `${dashboard.totalDuplicateGroups.toLocaleString()} groups found`}
      </p>
    </div>
  </div>

  {#if aiStats}
    <div class="border-border bg-surface border">
      <div class="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 class="text-ink text-lg font-semibold">AI processing</h3>
        <a href="/ai-processing" class="text-accent hover:text-accent-hover text-sm font-medium">
          View queue
        </a>
      </div>
      <div class="bg-border grid grid-cols-2 gap-px sm:grid-cols-5">
        <a href="/ai-processing?status=pending_review" class={aiLinkCell}>
          <span class="label-micro block">Pending review</span>
          <span class="block text-2xl font-semibold tabular-nums">
            {aiStats.pendingReview.toLocaleString()}
          </span>
        </a>
        <a href="/ai-processing?failed=true" class={aiLinkCell}>
          <span class="label-micro block">Failed</span>
          <span class="block text-2xl font-semibold tabular-nums">
            {aiStats.failed.toLocaleString()}
          </span>
        </a>
        <div class={aiCell}>
          <span class="label-micro block">Unprocessed</span>
          <span class="block text-2xl font-semibold tabular-nums">
            {aiStats.unprocessed.toLocaleString()}
          </span>
        </div>
        <div class={aiCell}>
          <span class="label-micro block">Applied</span>
          <span class="block text-2xl font-semibold tabular-nums">
            {aiStats.applied.toLocaleString()}
          </span>
        </div>
        <div class={aiCell}>
          <span class="label-micro block">Total tokens</span>
          <span class="block text-2xl font-semibold tabular-nums">
            {totalTokens.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  {/if}

  {#if jobs.length > 0}
    <div class="border-border bg-surface border">
      <div class="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 class="text-ink text-lg font-semibold">Recent Jobs</h3>
        <a href="/jobs" class="text-accent hover:text-accent-hover text-sm font-medium">View all</a>
      </div>
      <div class="divide-border divide-y">
        {#each jobs as job (job.id)}
          <JobStatusCard
            type={job.type}
            status={job.status ?? 'pending'}
            progress={job.progress ?? 0}
            phaseProgress={job.phaseProgress}
            progressMessage={job.progressMessage}
            startedAt={job.startedAt}
            completedAt={job.completedAt}
            errorMessage={job.errorMessage}
            resultJson={job.resultJson}
          />
        {/each}
      </div>
    </div>
  {/if}
</section>
