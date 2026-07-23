<script lang="ts">
  import { EChart } from '$lib/components';
  import type { ConfidenceBucket } from '@paperless-dedupe/core';
  import type { EChartsOption } from 'echarts';

  interface Props {
    topCorrespondents: { correspondent: string; groupCount: number }[];
    confidenceDistribution: ConfidenceBucket[];
  }

  let { topCorrespondents, confidenceDistribution }: Props = $props();
  const maxCount = $derived(topCorrespondents[0]?.groupCount ?? 1);
  const hasConfidenceData = $derived(confidenceDistribution.some((bucket) => bucket.count > 0));
  const chartOption: EChartsOption = $derived({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: confidenceDistribution.map((bucket) => bucket.label),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', name: 'Groups' },
    series: [
      {
        type: 'bar',
        data: confidenceDistribution.map((bucket) => ({
          value: bucket.count,
          itemStyle: { color: 'oklch(0.55 0.15 195)' },
        })),
        barMaxWidth: 40,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });
</script>

<section aria-labelledby="trends-heading">
  <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
    <div>
      <h2 id="trends-heading" class="text-ink text-lg font-semibold">Compact trends</h2>
      <p class="text-muted mt-1 text-sm">
        Use the detailed views when you are ready to investigate.
      </p>
    </div>
    <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm font-medium"
      >Explore duplicates</a
    >
  </div>

  <div class="grid gap-4 lg:grid-cols-2">
    {#if topCorrespondents.length > 0}
      <div class="panel">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h3 class="text-ink text-base font-semibold">Top duplicated correspondents</h3>
          <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm">View groups</a>
        </div>
        <ul class="space-y-3">
          {#each topCorrespondents as correspondent (correspondent.correspondent)}
            <li class="space-y-1">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-ink truncate">{correspondent.correspondent}</span>
                <span class="text-muted shrink-0 font-mono text-xs"
                  >{correspondent.groupCount} groups</span
                >
              </div>
              <div class="bg-canvas-deep h-2 overflow-hidden rounded-full">
                <div
                  class="bg-accent h-full rounded-full"
                  style={`width: ${(correspondent.groupCount / maxCount) * 100}%`}
                ></div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if hasConfidenceData}
      <div class="panel min-w-0">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h3 class="text-ink text-base font-semibold">Confidence distribution</h3>
          <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm">View groups</a>
        </div>
        <EChart option={chartOption} height="220px" />
      </div>
    {/if}
  </div>
</section>
