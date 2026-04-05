<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import RichTooltip from './RichTooltip.svelte';

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
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        return parts.length > 0 ? parts.join(', ') : 'No changes';
      }

      if (type === 'analysis') {
        return null; // Handled by analysisParts for richer rendering
      }

      if (type === 'batch_operation') {
        const parts: string[] = [];
        if (result.deletedDocuments > 0) parts.push(`${result.deletedDocuments} documents deleted`);
        if (result.deletedGroups > 0) parts.push(`${result.deletedGroups} groups resolved`);
        if (result.errors?.length > 0) parts.push(`${result.errors.length} errors`);
        return parts.length > 0 ? parts.join(', ') : 'No changes';
      }

      if (type === 'ai_processing') {
        const parts: string[] = [];
        if (result.processed > 0) parts.push(`${result.processed} processed`);
        if (result.succeeded > 0) parts.push(`${result.succeeded} succeeded`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        if (result.autoApplied > 0) parts.push(`${result.autoApplied} auto-applied`);
        return parts.length > 0 ? parts.join(', ') : 'No documents to process';
      }

      if (type === 'ai_apply') {
        const parts: string[] = [];
        if (result.total > 0) parts.push(`${result.applied} of ${result.total} applied`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        return parts.length > 0 ? parts.join(', ') : 'No results to apply';
      }

      if (type === 'rag_indexing') {
        const parts: string[] = [];
        if (result.indexed > 0)
          parts.push(`${result.indexed} indexed (${result.totalChunks} chunks)`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        return parts.length > 0 ? parts.join(', ') : 'No documents to index';
      }

      return null;
    } catch {
      return null;
    }
  });

  let analysisParts = $derived.by(() => {
    if (status !== 'completed' || !resultJson || type !== 'analysis') return null;
    try {
      const result = JSON.parse(resultJson);
      const analyzed = (result.documentsAnalyzed ?? 0) as number;
      const skipped = (result.documentsSkipped ?? 0) as number;
      const total = (result.totalDocuments ?? 0) as number;
      const isFullRebuild = (result.isFullRebuild ?? false) as boolean;
      const reasons = result.skipReasons as
        | { noContent: number; tooShort: number; shinglesFailed: number }
        | undefined;

      let prefix = '';
      if (isFullRebuild) {
        prefix = `${total.toLocaleString()} docs analyzed (full rebuild)`;
      } else if (analyzed > 0 || skipped > 0) {
        prefix = `${analyzed.toLocaleString()} new docs analyzed`;
      }

      const totalSuffix =
        !isFullRebuild && total > 0 ? ` (of ${total.toLocaleString()} total)` : '';

      const groupParts: string[] = [];
      if (result.groupsCreated > 0) groupParts.push(`${result.groupsCreated} groups created`);
      if (result.groupsUpdated > 0) groupParts.push(`${result.groupsUpdated} groups updated`);
      if (result.groupsRemoved > 0) groupParts.push(`${result.groupsRemoved} groups removed`);

      if (!prefix && groupParts.length === 0 && skipped === 0) {
        return {
          text: 'No duplicates found',
          skipped: 0,
          totalSuffix: '',
          groupsSuffix: '',
          skipReasons: null,
        };
      }

      return {
        text: prefix,
        skipped,
        totalSuffix,
        groupsSuffix: groupParts.length > 0 ? groupParts.join(', ') : '',
        skipReasons: reasons ?? null,
      };
    } catch {
      return null;
    }
  });

  const typeLabels: Record<string, string> = {
    sync: 'Sync',
    analysis: 'Analysis',
    batch_operation: 'Batch Delete',
    ai_processing: 'AI Processing',
    ai_apply: 'AI Apply',
    rag_indexing: 'RAG Indexing',
  };
</script>

<div class="border-soft bg-surface flex items-center gap-4 rounded-lg border px-4 py-3">
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="text-ink text-sm font-medium">{typeLabels[type] ?? type}</span>
      <StatusBadge {status} />
    </div>
    {#if (status === 'running' || status === 'paused') && progress !== undefined}
      <div class="mt-2">
        <ProgressBar
          {progress}
          phaseProgress={phaseProgress ?? undefined}
          message={progressMessage ?? ''}
          paused={status === 'paused'}
        />
      </div>
    {/if}
    {#if status === 'failed' && errorMessage}
      <p class="text-ember mt-1 truncate text-xs" title={errorMessage}>{errorMessage}</p>
    {/if}
    {#if analysisParts}
      <p class="text-muted mt-1 text-xs">
        {analysisParts.text}{#if analysisParts.skipped > 0}{#if analysisParts.text},
          {/if}{#if analysisParts.skipReasons}<RichTooltip position="bottom"
              ><span class="cursor-help border-b border-dotted border-current"
                >{analysisParts.skipped.toLocaleString()} skipped</span
              >{#snippet content()}<p class="font-semibold">Skip reasons</p>
                {#if analysisParts.skipReasons?.noContent && analysisParts.skipReasons.noContent > 0}<p
                    class="mt-1"
                  >
                    No text content: {analysisParts.skipReasons.noContent.toLocaleString()}
                  </p>{/if}
                {#if analysisParts.skipReasons?.tooShort && analysisParts.skipReasons.tooShort > 0}<p
                    class="mt-1"
                  >
                    Too few words (&lt;20): {analysisParts.skipReasons.tooShort.toLocaleString()}
                  </p>{/if}
                {#if analysisParts.skipReasons?.shinglesFailed && analysisParts.skipReasons.shinglesFailed > 0}<p
                    class="mt-1"
                  >
                    Processing failed: {analysisParts.skipReasons.shinglesFailed.toLocaleString()}
                  </p>{/if}{/snippet}</RichTooltip
            >{:else}{analysisParts.skipped.toLocaleString()} skipped{/if}{/if}{analysisParts.totalSuffix}{#if analysisParts.groupsSuffix},
          {analysisParts.groupsSuffix}{/if}
      </p>
    {:else if resultSummary}
      <p class="text-muted mt-1 text-xs">{resultSummary}</p>
    {/if}
  </div>
  {#if duration}
    <span class="text-muted shrink-0 font-mono text-xs">{duration}</span>
  {/if}
</div>
