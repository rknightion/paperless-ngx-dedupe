<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { Button, ConfirmDialog, Select, StatusBadge } from '$lib/components';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';

  let { data } = $props();

  let isClearing = $state(false);
  let showClearConfirm = $state(false);
  let feedback: { type: 'success' | 'error'; message: string } | null = $state(null);

  // Shape prefix is generated content so the message text stays exactly the message.
  const feedbackClasses = {
    success: "border-success text-success before:content-['■_']",
    error: "border-ember text-ember before:content-['●_']",
  } as const;

  const jobTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'sync', label: 'Sync' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'batch_operation', label: 'Batch Delete' },
    { value: 'ai_processing', label: 'AI Processing' },
    { value: 'ai_apply', label: 'AI Apply' },
    { value: 'ai_revert', label: 'AI Revert' },
    { value: 'custom_field_discovery', label: 'Custom Field Discovery' },
  ];

  const jobStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'paused', label: 'Paused' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const pageSizeOptions = ['10', '25', '50', '100'].map((size) => ({ value: size, label: size }));

  function applyFilter(key: string, value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('cursor');
    goto(`?${params.toString()}`, { replaceState: true });
  }

  let nextPageHref = $derived.by(() => {
    if (!data.nextCursor) return null;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('cursor', data.nextCursor);
    params.set('pageSize', String(data.filters.pageSize));
    return `?${params.toString()}`;
  });

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

  const typeLabels: Record<string, string> = Object.fromEntries(
    jobTypeOptions.filter((option) => option.value !== '').map((o) => [o.value, o.label]),
  );

  function formatDuration(startedAt: string | null, completedAt: string | null): string {
    if (!startedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function meterColor(status: string | null, fraction: number): string {
    if (fraction >= 1) return 'bg-success';
    if (status === 'running') return 'bg-accent';
    if (status === 'paused') return 'bg-warn';
    return 'bg-muted';
  }

  async function clearHistory() {
    showClearConfirm = false;
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

<div class="space-y-6">
  <header class="space-y-1">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-ink text-xl font-semibold">Job History</h1>
      <span class="text-muted font-mono text-xs">/jobs</span>
      <div class="ml-auto">
        <Button
          variant="outline"
          icon={TrashIcon}
          onclick={() => (showClearConfirm = true)}
          disabled={isClearing || data.counts.clearable === 0}
          describedBy={data.counts.clearable === 0 ? 'clear-history-reason' : undefined}
        >
          {isClearing ? 'Clearing...' : 'Clear History'}
        </Button>
        {#if data.counts.clearable === 0}
          <p id="clear-history-reason" class="text-muted mt-1 text-xs">
            No finished jobs to clear.
          </p>
        {/if}
      </div>
    </div>
    <p class="text-muted text-sm">View and manage the history of all background jobs.</p>
  </header>

  <!-- Filter row -->
  <div class="panel">
    <div class="flex flex-wrap items-end gap-4">
      <Select
        id="type-filter"
        label="Type"
        options={jobTypeOptions}
        value={data.filters.type ?? ''}
        onchange={(v) => applyFilter('type', v)}
      />

      <Select
        id="status-filter"
        label="Status"
        options={jobStatusOptions}
        value={data.filters.status ?? ''}
        onchange={(v) => applyFilter('status', v)}
      />

      <Select
        id="page-size-filter"
        label="Jobs per page"
        options={pageSizeOptions}
        value={String(data.filters.pageSize)}
        onchange={(v) => applyFilter('pageSize', v)}
      />
    </div>
  </div>

  {#if feedback}
    <p
      role={feedback.type === 'error' ? 'alert' : 'status'}
      aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
      class="border-l-2 py-1 pl-3 text-sm {feedbackClasses[feedback.type]}"
    >
      {feedback.message}
    </p>
  {/if}

  <!-- Job list: one status word per row, mono timestamps and durations -->
  {#if data.jobs.length > 0}
    <div class="border-border bg-surface border">
      <table class="w-full border-collapse text-left">
        <thead class="bg-surface sticky top-0 z-10">
          <tr class="border-border-hover border-b">
            <th scope="col" class="label-micro px-3 py-1.5 font-medium first:pl-6">Job</th>
            <th
              scope="col"
              class="label-micro hidden w-44 px-3 py-1.5 text-right font-medium md:table-cell"
            >
              Progress
            </th>
            <th
              scope="col"
              class="label-micro hidden w-28 px-3 py-1.5 text-right font-medium md:table-cell"
            >
              Started
            </th>
            <th
              scope="col"
              class="label-micro hidden w-24 px-3 py-1.5 text-right font-medium md:table-cell"
            >
              Duration
            </th>
            <th scope="col" class="label-micro px-3 py-1.5 font-medium">State</th>
            <th scope="col" class="label-micro px-3 py-1.5 text-right font-medium last:pr-6">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {#each data.jobs as j (j.key)}
            {@const fraction = Math.min(1, Math.max(0, j.progress ?? 0))}
            <tr
              data-job-key={j.key}
              class="border-border hover:bg-canvas-deep h-9 border-b last:border-b-0"
            >
              <td class="text-ink px-3 py-1 text-sm font-medium first:pl-6">
                {typeLabels[j.type] ?? j.type}
              </td>
              <td class="hidden px-3 py-1 text-right md:table-cell">
                {#if fraction > 0}
                  <span class="inline-flex items-center justify-end gap-2">
                    <span
                      class="inline-block h-1 w-16 overflow-hidden bg-(--furniture)"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full {meterColor(j.status, fraction)}"
                        style="width: {(fraction * 100).toFixed(1)}%"
                      ></span>
                    </span>
                    <span class="text-ink font-mono text-sm tabular-nums">
                      {(fraction * 100).toFixed(1)}%
                    </span>
                  </span>
                {:else}
                  <span class="text-muted font-mono text-sm">0</span>
                {/if}
              </td>
              <td
                class="text-muted hidden px-3 py-1 text-right font-mono text-xs tabular-nums md:table-cell"
              >
                {j.startedAt ? formatDate(j.startedAt) : '-'}
              </td>
              <td
                class="text-ink hidden px-3 py-1 text-right font-mono text-xs tabular-nums md:table-cell"
              >
                {formatDuration(j.startedAt, j.completedAt)}
              </td>
              <td class="px-3 py-1">
                <StatusBadge status={j.status ?? 'pending'} />
              </td>
              <td class="text-muted px-3 py-1 text-right font-mono text-xs tabular-nums last:pr-6">
                {formatDate(j.createdAt)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if nextPageHref}
      <nav aria-label="Job history pagination" class="flex justify-end">
        <Button variant="outline" href={nextPageHref}>Next page</Button>
      </nav>
    {/if}
  {:else}
    <p class="text-muted py-16 text-center text-sm">
      No jobs found{data.filters.type || data.filters.status ? ' matching filters' : ''}.
    </p>
  {/if}
</div>

<ConfirmDialog
  open={showClearConfirm}
  title="Clear {data.counts.clearable} finished {data.counts.clearable === 1 ? 'job' : 'jobs'}?"
  message="Completed, failed and cancelled jobs are removed from the history list."
  confirmLabel="Clear finished jobs"
  onconfirm={clearHistory}
  oncancel={() => (showClearConfirm = false)}
>
  <p class="text-muted mt-2 text-sm">
    Running, queued and paused jobs stay where they are, and nothing changes in Paperless.
  </p>
</ConfirmDialog>
