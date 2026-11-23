<script lang="ts">
  import { EChart, ProgressBar, Button, PageHeader } from '$lib/components';
  import DocumentLibraryFilters from '$lib/components/documents/DocumentLibraryFilters.svelte';
  import DocumentLibraryTable from '$lib/components/documents/DocumentLibraryTable.svelte';
  import DocumentQualitySummary from '$lib/components/documents/DocumentQualitySummary.svelte';
  import type { EChartsOption } from 'echarts';
  import { readToken } from '$lib/theme/tokens';

  let { data } = $props();

  const surfaceColor = $derived(readToken('--color-surface'));

  // Correspondent distribution bar chart
  let correspondentOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'value',
    },
    yAxis: {
      type: 'category',
      data: data.stats.correspondentDistribution.map((c) => c.name).reverse(),
      axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: data.stats.correspondentDistribution.map((c) => c.count).reverse(),
        barMaxWidth: 24,
      },
    ],
    grid: { left: 140, right: 20, top: 10, bottom: 30 },
  });

  // Document type donut chart
  let docTypeOption: EChartsOption = $derived({
    // No `color` array: the registered ECharts theme carries the design
    // system's six-series ramp, so charts inherit it and follow the theme.
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: data.stats.documentTypeDistribution.map((d) => ({
          name: d.name,
          value: d.count,
        })),
        label: { fontSize: 11 },
      },
    ],
  });

  // Tag treemap
  let tagOption: EChartsOption = $derived({
    tooltip: { formatter: '{b}: {c} documents' },
    series: [
      {
        type: 'treemap',
        data: data.stats.tagDistribution.map((t) => ({
          name: t.name,
          value: t.count,
        })),
        breadcrumb: { show: false },
        label: { fontSize: 11 },
        levels: [
          {
            itemStyle: {
              // Gaps read as the card surface beneath, so this must follow the
              // theme rather than stay white.
              borderColor: surfaceColor,
              borderWidth: 2,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  });

  // Documents over time area chart
  let documentsOverTimeOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.stats.documentsOverTime.map((d) => d.month),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', name: 'Documents' },
    series: [
      {
        type: 'line',
        data: data.stats.documentsOverTime.map((d) => d.count),
        areaStyle: { opacity: 0.3 },
        smooth: true,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });

  // Word count distribution bar chart
  let wordCountOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.stats.wordCountDistribution.map((d) => d.bucket),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', name: 'Documents' },
    series: [
      {
        type: 'bar',
        data: data.stats.wordCountDistribution.map((d) => d.count),
        barMaxWidth: 40,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });
</script>

<svelte:head>
  <title>Documents - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  {#if data.library}
    <PageHeader
      title="Document Library"
      description="Find synced documents and move directly into the relevant review workflow."
    >
      {#snippet actions()}
        <Button variant="secondary" href="/documents">View statistics only</Button>
      {/snippet}
    </PageHeader>

    <DocumentLibraryFilters query={data.library.query} />
    <DocumentQualitySummary
      counts={data.library.counts}
      query={data.library.query}
      insights={data.dataQuality.insights}
    />
    <DocumentLibraryTable
      items={data.library.items}
      nextCursor={data.library.nextCursor}
      limit={data.library.query.limit}
      paperlessUrl={data.paperlessUrl}
    />
  {:else}
    <PageHeader title="Documents" description="Library statistics and document overview.">
      {#snippet actions()}
        <Button href="/documents?library=true">Browse document library</Button>
      {/snippet}
    </PageHeader>
  {/if}

  <!-- Overview Divider -->
  {@render sectionLabel('Overview')}

  <!-- Stat strip: divided cells, mono label, 24px figure, mono note. -->
  <div class="border-border bg-surface flex flex-wrap border-t border-l">
    <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
      <p class="label-micro">Total Documents</p>
      <p class="text-ink text-2xl font-semibold tabular-nums">
        {data.stats.totalDocuments.toLocaleString()}
      </p>
      <p class="text-muted font-mono text-xs tabular-nums">
        Avg Word Count: {data.stats.averageWordCount.toLocaleString()}
      </p>
    </div>
    <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
      <p class="label-micro">OCR Coverage</p>
      <p class="text-ink text-2xl font-semibold tabular-nums">
        {data.stats.ocrCoverage.percentage}%
      </p>
      <div class="mt-1">
        <ProgressBar
          progress={data.stats.ocrCoverage.percentage / 100}
          message="{data.stats.ocrCoverage.withContent} of {data.stats.totalDocuments} documents"
          animated={false}
        />
      </div>
    </div>
    <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
      <p class="label-micro">Processing</p>
      <p class="text-ink text-2xl font-semibold tabular-nums">
        {data.stats.processingStatus.completed} / {data.stats.totalDocuments}
      </p>
      <p class="text-muted font-mono text-xs tabular-nums">
        {data.stats.processingStatus.pending} pending
      </p>
    </div>
    <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
      <p class="label-micro">Duplicate Involvement</p>
      <p class="text-ink text-2xl font-semibold tabular-nums">
        {data.stats.duplicateInvolvement.percentage}%
      </p>
      <p class="text-muted font-mono text-xs tabular-nums">
        {data.stats.duplicateInvolvement.documentsInGroups} of {data.stats.totalDocuments} documents
      </p>
    </div>
  </div>

  <!-- Deduplication Activity -->
  {#if data.stats.usageStats.cumulativeGroupsActioned > 0 || data.stats.usageStats.cumulativeDocumentsDeleted > 0}
    <div class="space-y-3">
      <div>
        <h2 class="text-ink text-lg font-semibold">Deduplication activity</h2>
        <p class="text-muted mt-1 text-sm">Cumulative totals across all deduplication sessions.</p>
      </div>
      <div class="border-border bg-surface flex flex-wrap border-t border-l">
        <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
          <p class="label-micro">Groups Actioned</p>
          <p class="text-ink text-2xl font-semibold tabular-nums">
            {data.stats.usageStats.cumulativeGroupsActioned.toLocaleString()}
          </p>
        </div>
        <div class="border-border min-w-44 flex-1 border-r border-b px-6 py-3">
          <p class="label-micro">Documents Deleted</p>
          <p class="text-ink text-2xl font-semibold tabular-nums">
            {data.stats.usageStats.cumulativeDocumentsDeleted.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Analytics Divider -->
  {@render sectionLabel('Analytics')}

  <!-- Documents Over Time -->
  {#if data.stats.documentsOverTime.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Documents over time</h2>
      <EChart option={documentsOverTimeOption} height="300px" />
    </div>
  {/if}

  <!-- Word Count Distribution -->
  {#if data.stats.wordCountDistribution.some((d) => d.count > 0)}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Word count distribution</h2>
      <EChart option={wordCountOption} height="250px" />
    </div>
  {/if}

  <!-- Correspondent + Document Type Distribution -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    {#if data.stats.correspondentDistribution.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Top correspondents</h2>
        <EChart
          option={correspondentOption}
          height={`${Math.max(250, data.stats.correspondentDistribution.length * 28)}px`}
        />
      </div>
    {/if}

    {#if data.stats.documentTypeDistribution.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Document types</h2>
        <EChart option={docTypeOption} height="300px" />
      </div>
    {/if}
  </div>

  <!-- Tag Frequency -->
  {#if data.stats.tagDistribution.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Tag frequency</h2>
      <EChart option={tagOption} height="350px" />
    </div>
  {/if}

  <!-- Data Quality Divider -->
  {@render sectionLabel('Data quality')}

  <!-- Data Quality -->
  {#if data.stats.unclassified.noCorrespondent > 0 || data.stats.unclassified.noDocumentType > 0 || data.stats.unclassified.noTags > 0}
    <div class="panel">
      <h2 class="text-ink mb-1 text-lg font-semibold">Data quality</h2>
      <p class="text-muted mb-3 text-sm">Documents missing classification metadata.</p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="panel-inset">
          <p class="text-ink text-2xl font-semibold tabular-nums">
            {data.stats.unclassified.noCorrespondent}
          </p>
          <p class="label-micro">No correspondent</p>
        </div>
        <div class="panel-inset">
          <p class="text-ink text-2xl font-semibold tabular-nums">
            {data.stats.unclassified.noDocumentType}
          </p>
          <p class="label-micro">No document type</p>
        </div>
        <div class="panel-inset">
          <p class="text-ink text-2xl font-semibold tabular-nums">
            {data.stats.unclassified.noTags}
          </p>
          <p class="label-micro">No tags</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- AI Classification -->
  {#if data.aiEnabled}
    <div class="panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-ink text-lg font-semibold">AI classification</h2>
        <p class="text-muted mt-1 text-sm">
          Select documents to classify with AI metadata extraction.
        </p>
      </div>
      <!-- One primary action per view region: the header owns it, so this is secondary. -->
      <a
        href="/ai-processing/queue"
        class="bg-surface text-ink border-border hover:bg-canvas hover:border-border-hover inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap"
      >
        Go to AI Processing
      </a>
    </div>
  {/if}

  <!-- External Link -->
  <div class="panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-ink text-lg font-semibold">Manage documents</h2>
      <p class="text-muted mt-1 text-sm">Open Paperless-NGX to manage individual documents.</p>
    </div>
    <a
      href="{data.paperlessUrl}/documents/"
      target="_blank"
      rel="noopener noreferrer"
      class="bg-surface text-ink border-border hover:bg-canvas hover:border-border-hover inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap"
    >
      Open Paperless-NGX
    </a>
  </div>
</div>

{#snippet sectionLabel(text: string)}
  <div class="flex items-center gap-4">
    <span class="label-micro">{text}</span>
    <div class="divider flex-1"></div>
  </div>
{/snippet}
