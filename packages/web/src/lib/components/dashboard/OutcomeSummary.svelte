<script lang="ts">
  import { JobStatusCard, StatCard } from '$lib/components';
  import { AlertCircle, Brain, CheckCircle, Clock, FileStack, Zap } from 'lucide-svelte';

  interface Dashboard {
    totalDocuments: number;
    pendingGroups: number;
    pendingAnalysis: number;
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
</script>

<section aria-labelledby="outcome-summary-heading" class="space-y-4">
  <div>
    <h2 id="outcome-summary-heading" class="text-ink text-lg font-semibold">Outcome summary</h2>
    <p class="text-muted mt-1 text-sm">A compact view of the work completed and still waiting.</p>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <a href="/documents" class="rounded-xl focus-visible:outline-none">
      <StatCard label="Total Documents" value={dashboard.totalDocuments.toLocaleString()}>
        {#snippet icon()}<FileStack class="h-5 w-5" />{/snippet}
      </StatCard>
    </a>
    <a href="/duplicates" class="rounded-xl focus-visible:outline-none">
      <StatCard label="Pending Groups" value={dashboard.pendingGroups.toLocaleString()}>
        {#snippet icon()}<AlertCircle class="h-5 w-5" />{/snippet}
      </StatCard>
    </a>
    <a href="/documents?processingStatus=pending" class="rounded-xl focus-visible:outline-none">
      <StatCard label="Pending Analysis" value={dashboard.pendingAnalysis.toLocaleString()}>
        {#snippet icon()}<Clock class="h-5 w-5" />{/snippet}
      </StatCard>
    </a>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    <div class="panel-inset">
      <p class="text-muted text-xs font-medium">Last sync outcome</p>
      <p class="text-ink mt-1 text-sm">
        {#if dashboard.lastSyncDocumentCount === null}
          No previous sync outcome
        {:else if dashboard.lastSyncDocumentCount === 0}
          No changes
        {:else}
          {dashboard.lastSyncDocumentCount.toLocaleString()} documents changed
        {/if}
      </p>
    </div>
    <div class="panel-inset">
      <p class="text-muted text-xs font-medium">Latest duplicate analysis</p>
      <p class="text-ink mt-1 text-sm">
        {dashboard.totalDuplicateGroups === null
          ? 'No completed analysis yet'
          : `${dashboard.totalDuplicateGroups.toLocaleString()} groups found`}
      </p>
    </div>
  </div>

  {#if aiStats}
    <div class="panel">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h3 class="text-ink flex items-center gap-2 text-base font-semibold">
          <Brain class="text-accent h-5 w-5" /> AI processing
        </h3>
        <a href="/ai-processing" class="text-accent hover:text-accent-hover text-sm font-medium"
          >View queue</a
        >
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <a href="/ai-processing?status=pending_review" class="panel-inset text-center">
          <Clock class="text-warn mx-auto h-5 w-5" />
          <p class="text-ink mt-2 text-lg font-semibold">
            {aiStats.pendingReview.toLocaleString()}
          </p>
          <p class="text-muted text-xs">Pending review</p>
        </a>
        <a href="/ai-processing?failed=true" class="panel-inset text-center">
          <AlertCircle class="text-ember mx-auto h-5 w-5" />
          <p class="text-ink mt-2 text-lg font-semibold">{aiStats.failed.toLocaleString()}</p>
          <p class="text-muted text-xs">Failed</p>
        </a>
        <div class="panel-inset text-center">
          <FileStack class="text-muted mx-auto h-5 w-5" />
          <p class="text-ink mt-2 text-lg font-semibold">{aiStats.unprocessed.toLocaleString()}</p>
          <p class="text-muted text-xs">Unprocessed</p>
        </div>
        <div class="panel-inset text-center">
          <CheckCircle class="text-success mx-auto h-5 w-5" />
          <p class="text-ink mt-2 text-lg font-semibold">{aiStats.applied.toLocaleString()}</p>
          <p class="text-muted text-xs">Applied</p>
        </div>
        <div class="panel-inset text-center">
          <Zap class="text-accent mx-auto h-5 w-5" />
          <p class="text-ink mt-2 text-lg font-semibold">{totalTokens.toLocaleString()}</p>
          <p class="text-muted text-xs">Total tokens</p>
        </div>
      </div>
    </div>
  {/if}

  {#if jobs.length > 0}
    <div class="panel">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h3 class="text-ink text-base font-semibold">Recent Jobs</h3>
        <a href="/jobs" class="text-accent hover:text-accent-hover text-sm font-medium">View all</a>
      </div>
      <div class="space-y-3">
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
