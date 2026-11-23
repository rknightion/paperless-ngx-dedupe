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
        // Colour comes from the registered theme's first series.
        data: confidenceDistribution.map((bucket) => bucket.count),
        barMaxWidth: 40,
      },
    ],
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
  });
</script>

<section aria-labelledby="trends-heading">
  <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
    <div>
      <h2 id="trends-heading" class="text-ink text-lg font-semibold">Compact trends</h2>
      <p class="text-muted mt-0.5 text-sm">
        Use the detailed views when you are ready to investigate.
      </p>
    </div>
    <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm font-medium">
      Explore duplicates
    </a>
  </div>

  <div class="grid gap-5 lg:grid-cols-2">
    {#if topCorrespondents.length > 0}
      <div class="border-border bg-surface border p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 class="text-ink text-lg font-semibold">Top duplicated correspondents</h3>
          <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm">View groups</a>
        </div>
        <ul class="space-y-3">
          {#each topCorrespondents as correspondent (correspondent.correspondent)}
            <li class="space-y-1">
              <div class="flex items-center justify-between gap-3 text-base">
                <span class="text-ink truncate">{correspondent.correspondent}</span>
                <span class="text-muted shrink-0 font-mono text-xs tabular-nums">
                  {correspondent.groupCount} groups
                </span>
              </div>
              <div
                class="h-1.5 overflow-hidden"
                style="background: var(--furniture)"
                aria-hidden="true"
              >
                <div
                  class="bg-chart-1 h-full"
                  style={`width: ${(correspondent.groupCount / maxCount) * 100}%`}
                ></div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if hasConfidenceData}
      <div class="border-border bg-surface min-w-0 border p-4">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h3 class="text-ink text-lg font-semibold">Confidence distribution</h3>
          <a href="/duplicates" class="text-accent hover:text-accent-hover text-sm">View groups</a>
        </div>
        <!-- The one confidence legend on this screen. Bands match ConfidenceBadge. -->
        <p class="status-word mb-3 flex flex-wrap gap-x-3">
          <span class="text-success">■ HIGH &gt;= 90</span>
          <span class="text-warn">◆ MEDIUM 75-90</span>
          <span class="text-ember">● LOW &lt; 75</span>
        </p>
        <EChart option={chartOption} height="220px" />
      </div>
    {/if}
  </div>
</section>
