<script lang="ts">
  interface Props {
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    metadataSimilarity: number | null;
    filenameSimilarity: number | null;
  }

  let { jaccardSimilarity, fuzzyTextRatio, metadataSimilarity, filenameSimilarity }: Props =
    $props();

  function fmt(score: number | null): string {
    return score !== null ? `${Math.round(score * 100)}%` : 'N/A';
  }

  function barColor(score: number | null): string {
    if (score === null) return 'bg-white/30';
    if (score >= 0.9) return 'bg-green-400';
    if (score >= 0.8) return 'bg-amber-400';
    if (score >= 0.75) return 'bg-orange-400';
    return 'bg-red-400';
  }

  let components = $derived([
    { label: 'Jaccard', score: jaccardSimilarity },
    { label: 'Fuzzy Text', score: fuzzyTextRatio },
    { label: 'Metadata', score: metadataSimilarity },
    { label: 'Filename', score: filenameSimilarity },
  ]);
</script>

<div class="space-y-1.5">
  <div class="mb-1 text-[10px] font-semibold tracking-wider text-white/70 uppercase">
    Score Breakdown
  </div>
  {#each components as comp (comp.label)}
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-[10px] text-white/80">{comp.label}</span>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
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
