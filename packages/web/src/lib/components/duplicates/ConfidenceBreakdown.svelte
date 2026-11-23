<script lang="ts">
  import ConfidenceBadge from '../ui/ConfidenceBadge.svelte';
  import ConfidenceLegend from '../ui/ConfidenceLegend.svelte';
  import { BAND_META, confidenceBand } from '../ui/confidence';

  interface Props {
    overallScore: number;
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
    weights?: { jaccard: number; fuzzy: number; penaltyStrength: number };
    /** The band legend is printed once per screen, here, beside the headline score. */
    showLegend?: boolean;
  }

  let {
    overallScore,
    jaccardSimilarity,
    fuzzyTextRatio,
    discriminativeScore,
    weights,
    showLegend = true,
  }: Props = $props();

  // A magnitude readout, so three inline meters rather than a chart canvas.
  // The same three bands as ConfidenceBadge, from ui/confidence.ts.
  const components = $derived(
    [
      {
        name: 'Jaccard (Shingles)',
        note: weights?.jaccard !== undefined ? `${weights.jaccard}%` : null,
        score: jaccardSimilarity,
      },
      {
        name: 'Fuzzy Text',
        note: weights?.fuzzy !== undefined ? `${weights.fuzzy}%` : null,
        score: fuzzyTextRatio,
      },
      {
        name: 'Discriminative',
        note: weights?.penaltyStrength !== undefined ? `penalty ${weights.penaltyStrength}%` : null,
        score: discriminativeScore,
      },
    ].map((c) => ({
      ...c,
      meta: c.score !== null ? BAND_META[confidenceBand(c.score)] : null,
      pct: c.score !== null ? Math.round(Math.min(1, Math.max(0, c.score)) * 1000) / 10 : 0,
    })),
  );
</script>

<div class="panel">
  <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h3 class="text-ink text-lg font-semibold">Confidence Breakdown</h3>
    <ConfidenceBadge score={overallScore} />
    {#if showLegend}
      <ConfidenceLegend class="sm:ml-auto" />
    {/if}
  </div>
  <ul class="border-border divide-border divide-y border-y">
    {#each components as comp (comp.name)}
      <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
        <span class="text-ink w-56 shrink-0 text-sm">
          {comp.name}
          {#if comp.note}<span class="text-muted font-mono">{comp.note}</span>{/if}
        </span>
        <span class="h-1.5 min-w-24 flex-1 overflow-hidden bg-(--furniture)" aria-hidden="true">
          {#if comp.meta && comp.pct > 0}
            <span class="block h-full {comp.meta.fill}" style="width: {comp.pct}%"></span>
          {/if}
        </span>
        <span class="w-36 shrink-0 text-right">
          {#if comp.score !== null}
            <ConfidenceBadge score={comp.score} />
          {:else}
            <span class="text-muted font-mono text-sm">N/A</span>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
</div>
