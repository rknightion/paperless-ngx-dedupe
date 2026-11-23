<script lang="ts">
  import { BAND_META, confidenceBand, formatConfidence } from '../ui/confidence';

  interface Props {
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
  }

  let { jaccardSimilarity, fuzzyTextRatio, discriminativeScore }: Props = $props();

  // The bands come from ui/confidence.ts, shared with ConfidenceBadge and
  // ConfidenceBreakdown. The tooltip surface follows the theme, so these use
  // the ordinary ink tokens.
  let components = $derived(
    [
      { label: 'Jaccard', score: jaccardSimilarity },
      { label: 'Fuzzy Text', score: fuzzyTextRatio },
      { label: 'Discriminative', score: discriminativeScore },
    ].map((c) => ({
      ...c,
      meta: c.score !== null ? BAND_META[confidenceBand(c.score)] : null,
      pct: c.score !== null ? Math.round(Math.min(1, Math.max(0, c.score)) * 100) : 0,
      text: c.score !== null ? formatConfidence(c.score) : 'N/A',
    })),
  );
</script>

<div class="space-y-1.5">
  <div class="label-micro mb-1">Score breakdown</div>
  {#each components as comp (comp.label)}
    <div class="flex items-center gap-2">
      <span class="text-ink-light w-24 shrink-0 text-xs">{comp.label}</span>
      <div class="h-1 flex-1 overflow-hidden bg-(--furniture)" aria-hidden="true">
        {#if comp.meta && comp.pct > 0}
          <div class="h-full {comp.meta.fill}" style="width: {comp.pct}%"></div>
        {/if}
      </div>
      <span
        class="w-20 shrink-0 text-right font-mono text-xs font-medium tabular-nums {comp.meta
          ? comp.meta.text
          : 'text-muted'}"
      >
        {#if comp.meta}<span aria-hidden="true">{comp.meta.shape}</span>{/if}
        {comp.text}
      </span>
    </div>
  {/each}
</div>
