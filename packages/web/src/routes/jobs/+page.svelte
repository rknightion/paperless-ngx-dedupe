<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { JobStatusCard } from '$lib/components';
  import { Trash2 } from 'lucide-svelte';

  let { data } = $props();

  let isClearing = $state(false);
  let feedback: { type: 'success' | 'error'; message: string } | null = $state(null);

  const jobTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'sync', label: 'Sync' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'batch_operation', label: 'Batch Delete' },
    { value: 'ai_processing', label: 'AI Processing' },
    { value: 'ai_apply', label: 'AI Apply' },
    { value: 'rag_indexing', label: 'RAG Indexing' },
  ];

  const jobStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  function applyFilter(key: string, value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function formatDate(iso: string): string {
    const date = new Date(iso);
    const now = Date.now();
    const seconds = Math.floor((now - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  let terminalJobCount = $derived(
    data.jobs.filter(
      (j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled',
    ).length,
  );

  async function clearHistory() {
    if (!confirm('Clear all completed, failed, and cancelled jobs from history?')) return;
    isClearing = true;
    feedback = null;
    try {
      const res = await fetch('/api/v1/jobs', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear history');
      const body = await res.json();
      feedback = { type: 'success', message: `Cleared ${body.data.deleted} jobs` };
      await invalidateAll();
    } catch (err) {
      feedback = { type: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      isClearing = false;
    }
  }
</script>

<svelte:head>
  <title>Job History - Paperless NGX Dedupe</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <div>
    <h1 class="text-ink text-2xl font-bold">Job History</h1>
    <p class="text-muted mt-1 text-sm">View and manage the history of all background jobs.</p>
  </div>

  <!-- Filter Bar -->
  <div class="panel">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label for="type-filter" class="text-ink block text-sm font-medium">Type</label>
        <select
          id="type-filter"
          onchange={(e) => applyFilter('type', (e.target as HTMLSelectElement).value)}
          value={data.filters.type ?? ''}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        >
          {#each jobTypeOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="status-filter" class="text-ink block text-sm font-medium">Status</label>
        <select
          id="status-filter"
          onchange={(e) => applyFilter('status', (e.target as HTMLSelectElement).value)}
          value={data.filters.status ?? ''}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        >
          {#each jobStatusOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <div class="ml-auto">
        <button
          onclick={clearHistory}
          disabled={isClearing || terminalJobCount === 0}
          class="bg-ember/10 text-ember hover:bg-ember/20 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
        >
          <Trash2 class="h-4 w-4" />
          {isClearing ? 'Clearing...' : 'Clear History'}
        </button>
      </div>
    </div>
  </div>

  {#if feedback}
    <div
      class="rounded-lg border px-4 py-3 text-sm {feedback.type === 'success'
        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'}"
    >
      {feedback.message}
    </div>
  {/if}

  <!-- Job List -->
  {#if data.jobs.length > 0}
    <div class="space-y-3">
      {#each data.jobs as j (j.id)}
        <div class="space-y-1">
          <JobStatusCard
            type={j.type}
            status={j.status ?? 'pending'}
            progress={j.progress ?? 0}
            phaseProgress={j.phaseProgress}
            progressMessage={j.progressMessage}
            startedAt={j.startedAt}
            completedAt={j.completedAt}
            errorMessage={j.errorMessage}
            resultJson={j.resultJson}
          />
          <p class="text-muted px-1 text-xs">{formatDate(j.createdAt)}</p>
        </div>
      {/each}
    </div>
  {:else}
    <div class="py-16 text-center">
      <p class="text-muted">
        No jobs found{data.filters.type || data.filters.status ? ' matching filters' : ''}.
      </p>
    </div>
  {/if}
</div>
