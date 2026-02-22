<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    type: string;
    status: string;
    progress?: number;
    phaseProgress?: number | null;
    progressMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    errorMessage?: string | null;
    resultJson?: string | null;
  }

  let {
    type,
    status,
    progress,
    phaseProgress,
    progressMessage,
    startedAt,
    completedAt,
    errorMessage,
    resultJson,
  }: Props = $props();

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

  let resultSummary = $derived.by(() => {
    if (status !== 'completed' || !resultJson) return null;
    try {
      const result = JSON.parse(resultJson);

      if (type === 'sync') {
        const parts: string[] = [];
        if (result.inserted > 0) parts.push(`${result.inserted} added`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        return parts.length > 0 ? parts.join(', ') : 'No changes';
      }

      if (type === 'analysis') {
        const parts: string[] = [];
        if (result.documentsAnalyzed != null)
          parts.push(`${result.documentsAnalyzed} docs analyzed`);
        if (result.groupsCreated > 0) parts.push(`${result.groupsCreated} groups created`);
        if (result.groupsUpdated > 0) parts.push(`${result.groupsUpdated} groups updated`);
        if (result.groupsRemoved > 0) parts.push(`${result.groupsRemoved} groups removed`);
        return parts.length > 0 ? parts.join(', ') : 'No duplicates found';
      }

      return null;
    } catch {
      return null;
    }
  });

  const typeLabels: Record<string, string> = {
    sync: 'Sync',
    analysis: 'Analysis',
    batch_review: 'Batch Review',
    batch_resolve: 'Batch Resolve',
    batch_delete: 'Batch Delete',
  };
</script>

<div class="border-soft bg-surface flex items-center gap-4 rounded-lg border px-4 py-3">
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="text-ink text-sm font-medium">{typeLabels[type] ?? type}</span>
      <StatusBadge {status} />
    </div>
    {#if status === 'running' && progress !== undefined}
      <div class="mt-2">
        <ProgressBar
          {progress}
          phaseProgress={phaseProgress ?? undefined}
          message={progressMessage ?? ''}
        />
      </div>
    {/if}
    {#if status === 'failed' && errorMessage}
      <p class="text-ember mt-1 truncate text-xs" title={errorMessage}>{errorMessage}</p>
    {/if}
    {#if resultSummary}
      <p class="text-muted mt-1 text-xs">{resultSummary}</p>
    {/if}
  </div>
  {#if duration}
    <span class="text-muted shrink-0 font-mono text-xs">{duration}</span>
  {/if}
</div>
