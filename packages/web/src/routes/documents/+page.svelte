<script lang="ts">
  import { StatCard, EChart, ProgressBar } from '$lib/components';
  import { formatBytes } from '$lib/utils/format';
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
        itemStyle: { color: 'oklch(0.55 0.15 195)' },
        barMaxWidth: 24,
      },
    ],
    grid: { left: 140, right: 20, top: 10, bottom: 30 },
  });

  // Document type donut chart
  let docTypeOption: EChartsOption = $derived({
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
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
        },
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
              borderColor: '#fff',
              borderWidth: 2,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  });
</script>

<svelte:head>
  <title>Documents - Paperless Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-ink text-3xl font-bold">Documents</h1>
    <p class="text-muted mt-1">Library statistics and document overview.</p>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Total Documents" value={data.stats.totalDocuments.toLocaleString()} />
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
    />
    <StatCard label="Avg Word Count" value={data.stats.averageWordCount.toLocaleString()} />
  </div>

  <!-- Charts -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Correspondent Distribution -->
    {#if data.stats.correspondentDistribution.length > 0}
      <div class="panel">
        <h2 class="text-ink mb-4 text-lg font-semibold">Top Correspondents</h2>
        <EChart
          option={correspondentOption}
          height={`${Math.max(250, data.stats.correspondentDistribution.length * 28)}px`}
        />
      </div>
    {/if}

    <!-- Document Type Distribution -->
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
