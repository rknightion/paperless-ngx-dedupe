<script lang="ts">
  interface Props {
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
  }

  let { jaccardSimilarity, fuzzyTextRatio, discriminativeScore }: Props = $props();

  function fmt(score: number | null): string {
    return score !== null ? `${Math.round(score * 100)}%` : 'N/A';
  }

  // Same three bands as ConfidenceBadge and ConfidenceBreakdown — keep the
  // three in step.
  function barColor(score: number | null): string {
    if (score === null) return 'bg-on-inverse/30';
    if (score >= 0.9) return 'bg-success';
    if (score >= 0.75) return 'bg-warn';
    return 'bg-ember';
  }

  let components = $derived([
    { label: 'Jaccard', score: jaccardSimilarity },
    { label: 'Fuzzy Text', score: fuzzyTextRatio },
    { label: 'Discriminative', score: discriminativeScore },
  ]);
</script>

<div class="space-y-1.5">
  <div class="text-on-inverse/70 mb-1 text-[10px] font-semibold tracking-wider uppercase">
    Score Breakdown
  </div>
  {#each components as comp (comp.label)}
    <div class="flex items-center gap-2">
      <span class="text-on-inverse/80 w-16 shrink-0 text-[10px]">{comp.label}</span>
      <div class="bg-on-inverse/20 h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full {barColor(comp.score)}"
          style="width: {comp.score !== null ? Math.round(comp.score * 100) : 0}%"
        ></div>
      </div>
      <span class="w-8 shrink-0 text-right text-[10px] font-medium tabular-nums">
        {fmt(comp.score)}
      </span>
    </div>
  {/each}
</div>
