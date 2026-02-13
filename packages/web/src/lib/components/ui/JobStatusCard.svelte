<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    type: string;
    status: string;
    progress?: number;
    progressMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }

  let { type, status, progress, progressMessage, startedAt, completedAt }: Props = $props();

  let duration = $derived.by(() => {
    if (!startedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const seconds = Math.round((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
  });

  const typeLabels: Record<string, string> = {
    sync: 'Sync',
    analysis: 'Analysis',
    batch_review: 'Batch Review',
    batch_resolve: 'Batch Resolve',
    batch_delete: 'Batch Delete',
  };
</script>

<div class="flex items-center gap-4 rounded-lg border border-soft bg-surface px-4 py-3">
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-ink">{typeLabels[type] ?? type}</span>
      <StatusBadge {status} />
    </div>
    {#if status === 'running' && progress !== undefined}
      <div class="mt-2">
        <ProgressBar {progress} message={progressMessage ?? ''} />
      </div>
    {/if}
  </div>
  {#if duration}
    <span class="shrink-0 text-xs font-mono text-muted">{duration}</span>
  {/if}
</div>
