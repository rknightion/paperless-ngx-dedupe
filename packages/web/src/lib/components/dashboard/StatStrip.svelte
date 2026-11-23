<script lang="ts">
  interface Props {
    totalDocuments: number;
    pendingGroups: number;
    totalDuplicateGroups: number | null;
    pendingAnalysis: number;
    reclaimableBytes: number | null;
  }

  let {
    totalDocuments,
    pendingGroups,
    totalDuplicateGroups,
    pendingAnalysis,
    reclaimableBytes,
  }: Props = $props();

  const cell = 'bg-surface px-3 py-3 md:px-6';
  const linkCell = `${cell} text-ink hover:bg-canvas-deep block`;
</script>

<!-- Divided cells, four at most. The 1px gap over a border-coloured ground is
     the rule between cells, so it holds when the strip folds to two columns. -->
<div class="bg-border border-border grid grid-cols-2 gap-px border-b md:grid-cols-4">
  <a href="/documents" class={linkCell}>
    <span class="label-micro block">Total Documents</span>
    <span class="block text-2xl font-semibold tabular-nums">{totalDocuments.toLocaleString()}</span>
    <span class="text-muted block font-mono text-xs">in the local database</span>
  </a>
  <a href="/duplicates" class={linkCell}>
    <span class="label-micro block">Pending Groups</span>
    <span class="block text-2xl font-semibold tabular-nums">{pendingGroups.toLocaleString()}</span>
    {#if totalDuplicateGroups !== null}
      <span class="text-muted block font-mono text-xs">
        of {totalDuplicateGroups.toLocaleString()} total
      </span>
    {/if}
  </a>
  <a href="/documents?processingStatus=pending" class={linkCell}>
    <span class="label-micro block">Pending Analysis</span>
    <span class="block text-2xl font-semibold tabular-nums">
      {pendingAnalysis.toLocaleString()}
    </span>
    <span class="text-muted block font-mono text-xs">documents to analyse</span>
  </a>
  <section aria-label="Reclaimable storage" class={cell}>
    <span class="label-micro block">Reclaimable</span>
    <span class="block text-2xl font-semibold [overflow-wrap:anywhere] tabular-nums">
      {reclaimableBytes === null ? 'Unknown' : `${reclaimableBytes.toLocaleString()} bytes`}
    </span>
    <span class="text-muted block font-mono text-xs">non-primary, pending groups</span>
    <!-- The full explanation stays available to assistive technology. -->
    <span class="sr-only">
      Estimated original and archive sizes of non-primary documents in pending groups. Refreshed
      after analysis; space is freed only after Paperless purges its recycle bin.
    </span>
  </section>
</div>
