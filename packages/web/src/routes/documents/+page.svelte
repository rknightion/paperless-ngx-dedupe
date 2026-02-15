<script lang="ts">
  import { StatCard, EChart, ProgressBar } from '$lib/components';
  import { formatBytes } from '$lib/utils/format';
  import { FileStack, Database, Clock, Type, Copy } from 'lucide-svelte';
  import type { EChartsOption } from 'echarts';

  let { data } = $props();

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
        itemStyle: { color: 'oklch(0.7 0.15 85)' },
        barMaxWidth: 24,
      },
    ],
    grid: { left: 140, right: 20, top: 10, bottom: 30 },
  });

  // Document type donut chart
  let docTypeOption: EChartsOption = $derived({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: [
      'oklch(0.55 0.15 195)',
      'oklch(0.6 0.16 155)',
      'oklch(0.65 0.14 265)',
      'oklch(0.7 0.15 85)',
      'oklch(0.6 0.18 330)',
      'oklch(0.6 0.12 140)',
    ],
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: data.stats.documentTypeDistribution.map((d) => ({
          name: d.name,
          value: d.count,
        })),
        label: { fontSize: 11 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
        },
      },
    ],
  });

  // Tag treemap
  let tagOption: EChartsOption = $derived({
    tooltip: { formatter: '{b}: {c} documents' },
    color: [
      'oklch(0.55 0.15 195)',
      'oklch(0.6 0.16 155)',
      'oklch(0.65 0.14 265)',
      'oklch(0.7 0.15 85)',
      'oklch(0.6 0.18 330)',
      'oklch(0.6 0.12 140)',
    ],
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
              borderColor: '#fff',
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
        itemStyle: { color: 'oklch(0.55 0.15 195)' },
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });

  // File size distribution bar chart
  let fileSizeOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.stats.fileSizeDistribution.map((d) => d.bucket),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', name: 'Documents' },
    series: [
      {
        type: 'bar',
        data: data.stats.fileSizeDistribution.map((d) => d.count),
        itemStyle: { color: 'oklch(0.65 0.14 265)' },
        barMaxWidth: 40,
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
        itemStyle: { color: 'oklch(0.6 0.16 155)' },
        barMaxWidth: 40,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });
</script>

<svelte:head>
  <title>Documents - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <header class="space-y-1">
    <h1 class="text-ink text-2xl font-semibold tracking-tight">Documents</h1>
    <p class="text-muted mt-1">Library statistics and document overview.</p>
  </header>

  <!-- Overview Divider -->
  <div class="flex items-center gap-4">
    <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Overview</span>
    <div class="divider flex-1"></div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <StatCard label="Total Documents" value={data.stats.totalDocuments.toLocaleString()}>
      {#snippet icon()}<FileStack class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard label="Total Storage" value={formatBytes(data.stats.totalStorageBytes)}>
      {#snippet icon()}<Database class="h-5 w-5" />{/snippet}
    </StatCard>
    <div class="panel">
      <p class="text-muted text-sm">OCR Coverage</p>
      <p class="text-ink mt-1 text-2xl font-semibold">{data.stats.ocrCoverage.percentage}%</p>
      <div class="mt-2">
        <ProgressBar
          progress={data.stats.ocrCoverage.percentage / 100}
          message="{data.stats.ocrCoverage.withContent} of {data.stats.totalDocuments} documents"
          animated={false}
        />
      </div>
    </div>
    <StatCard
      label="Processing"
      value="{data.stats.processingStatus.completed} / {data.stats.totalDocuments}"
      trendLabel="{data.stats.processingStatus.pending} pending"
      trend={data.stats.processingStatus.pending > 0 ? 'neutral' : 'up'}
    >
      {#snippet icon()}<Clock class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard label="Avg Word Count" value={data.stats.averageWordCount.toLocaleString()}>
      {#snippet icon()}<Type class="h-5 w-5" />{/snippet}
    </StatCard>
    <StatCard
      label="Duplicate Involvement"
      value="{data.stats.duplicateInvolvement.percentage}%"
      trendLabel="{data.stats.duplicateInvolvement.documentsInGroups} of {data.stats
        .totalDocuments} documents"
      trend={data.stats.duplicateInvolvement.percentage > 0 ? 'neutral' : 'up'}
    >
      {#snippet icon()}<Copy class="h-5 w-5" />{/snippet}
    </StatCard>
  </div>

  <!-- Deduplication Activity -->
  {#if data.stats.usageStats.cumulativeGroupsActioned > 0 || data.stats.usageStats.cumulativeDocumentsDeleted > 0}
    <div>
      <h2 class="text-ink text-lg font-semibold">Deduplication Activity</h2>
      <p class="text-muted mt-1 mb-3 text-sm">
        Cumulative totals across all deduplication sessions.
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Groups Actioned"
          value={data.stats.usageStats.cumulativeGroupsActioned.toLocaleString()}
        />
        <StatCard
          label="Documents Deleted"
          value={data.stats.usageStats.cumulativeDocumentsDeleted.toLocaleString()}
        />
        <StatCard
          label="Storage Reclaimed"
          value={formatBytes(data.stats.usageStats.cumulativeStorageBytesReclaimed)}
        />
      </div>
    </div>
  {/if}

  <!-- Analytics Divider -->
  <div class="flex items-center gap-4">
    <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Analytics</span>
    <div class="divider flex-1"></div>
  </div>

  <!-- Documents Over Time -->
  {#if data.stats.documentsOverTime.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Documents Over Time</h2>
      <EChart option={documentsOverTimeOption} height="300px" />
    </div>
  {/if}

  <!-- File Size + Word Count Distribution -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    {#if data.stats.fileSizeDistribution.some((d) => d.count > 0)}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">File Size Distribution</h2>
        <EChart option={fileSizeOption} height="250px" />
      </div>
    {/if}

    {#if data.stats.wordCountDistribution.some((d) => d.count > 0)}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Word Count Distribution</h2>
        <EChart option={wordCountOption} height="250px" />
      </div>
    {/if}
  </div>

  <!-- Correspondent + Document Type Distribution -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    {#if data.stats.correspondentDistribution.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Top Correspondents</h2>
        <EChart
          option={correspondentOption}
          height={`${Math.max(250, data.stats.correspondentDistribution.length * 28)}px`}
        />
      </div>
    {/if}

    {#if data.stats.documentTypeDistribution.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Document Types</h2>
        <EChart option={docTypeOption} height="300px" />
      </div>
    {/if}
  </div>

  <!-- Tag Frequency -->
  {#if data.stats.tagDistribution.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Tag Frequency</h2>
      <EChart option={tagOption} height="350px" />
    </div>
  {/if}

  <!-- Data Quality Divider -->
  <div class="flex items-center gap-4">
    <span class="text-ink-light text-xs font-medium tracking-wider uppercase">Data Quality</span>
    <div class="divider flex-1"></div>
  </div>

  <!-- Data Quality -->
  {#if data.stats.unclassified.noCorrespondent > 0 || data.stats.unclassified.noDocumentType > 0 || data.stats.unclassified.noTags > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Data Quality</h2>
      <p class="text-muted mb-3 text-sm">Documents missing classification metadata.</p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="bg-canvas rounded-lg p-3 text-center">
          <p class="text-ink text-2xl font-semibold">
            {data.stats.unclassified.noCorrespondent}
          </p>
          <p class="text-muted text-xs">No Correspondent</p>
        </div>
        <div class="bg-canvas rounded-lg p-3 text-center">
          <p class="text-ink text-2xl font-semibold">
            {data.stats.unclassified.noDocumentType}
          </p>
          <p class="text-muted text-xs">No Document Type</p>
        </div>
        <div class="bg-canvas rounded-lg p-3 text-center">
          <p class="text-ink text-2xl font-semibold">
            {data.stats.unclassified.noTags}
          </p>
          <p class="text-muted text-xs">No Tags</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Largest Documents -->
  {#if data.stats.largestDocuments.length > 0}
    <div class="panel">
      <h2 class="text-ink mb-4 text-lg font-semibold">Largest Documents</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-soft border-b text-left">
              <th class="text-muted pb-2 font-medium">Title</th>
              <th class="text-muted pb-2 font-medium">Correspondent</th>
              <th class="text-muted pb-2 text-right font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {#each data.stats.largestDocuments as doc (doc.id)}
              <tr
                class="border-soft hover:bg-accent-subtle border-b transition-colors last:border-0"
              >
                <td class="text-ink py-2 font-medium">{doc.title}</td>
                <td class="text-muted py-2">{doc.correspondent ?? '-'}</td>
                <td class="text-muted py-2 text-right font-mono text-xs">
                  {formatBytes(doc.archiveFileSize)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <!-- External Link -->
  <div class="panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-ink text-lg font-semibold">Manage Documents</h2>
      <p class="text-muted mt-1 text-sm">Open Paperless-NGX to manage individual documents.</p>
    </div>
    <a
      href="{data.paperlessUrl}/documents/"
      target="_blank"
      rel="noopener noreferrer"
      class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
    >
      Open Paperless-NGX
    </a>
  </div>
</div>
