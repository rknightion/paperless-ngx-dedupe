<script lang="ts">
  import { ConfidenceBadge, EChart } from '$lib/components';
  import type { EChartsOption } from 'echarts';
  import { readToken } from '$lib/theme/tokens';

  interface Props {
    overallScore: number;
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
    weights?: { jaccard: number; fuzzy: number; penaltyStrength: number };
  }

  let { overallScore, jaccardSimilarity, fuzzyTextRatio, discriminativeScore, weights }: Props =
    $props();

  // Same three bands as ConfidenceBadge — keep them in step. Resolved rather
  // than var() references because these are painted onto an ECharts canvas.
  const bandColors = $derived({
    none: readToken('--color-muted'),
    high: readToken('--color-success'),
    medium: readToken('--color-warn'),
    low: readToken('--color-ember'),
  });

  function scoreColor(score: number | null): string {
    if (score === null) return bandColors.none;
    if (score >= 0.9) return bandColors.high;
    if (score >= 0.75) return bandColors.medium;
    return bandColors.low;
  }

  const components = $derived([
    { name: 'Jaccard (Shingles)', score: jaccardSimilarity, weight: weights?.jaccard },
    { name: 'Fuzzy Text', score: fuzzyTextRatio, weight: weights?.fuzzy },
    {
      name:
        weights?.penaltyStrength !== undefined
          ? `Discriminative (Penalty ${weights.penaltyStrength}%)`
          : 'Discriminative',
      score: discriminativeScore,
      weight: undefined,
    },
  ]);

  let chartOption: EChartsOption = $derived({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = (params as { name: string; value: number }[])[0];
        if (p.value < 0) return `${p.name}: N/A`;
        return `${p.name}: ${Math.round(p.value * 100)}%`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` },
    },
    yAxis: {
      type: 'category',
      data: components
        .map((c) => {
          const label = c.name;
          return c.weight !== undefined ? `${label} (${c.weight}%)` : label;
        })
        .reverse(),
      axisLabel: { fontSize: 11, width: 140, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: components
          .map((c) => ({
            value: c.score ?? -0.01,
            itemStyle: { color: scoreColor(c.score) },
            label: {
              show: true,
              position: 'right' as const,
              formatter: () => (c.score !== null ? `${Math.round(c.score * 100)}%` : 'N/A'),
              fontSize: 11,
            },
          }))
          .reverse(),
        barMaxWidth: 28,
      },
    ],
    grid: { left: 160, right: 60, top: 10, bottom: 30 },
  });
</script>

<div class="panel">
  <div class="mb-4 flex items-center gap-3">
    <h3 class="text-ink text-base font-semibold">Confidence Breakdown</h3>
    <ConfidenceBadge score={overallScore} />
  </div>
  <EChart option={chartOption} height="160px" />
</div>
