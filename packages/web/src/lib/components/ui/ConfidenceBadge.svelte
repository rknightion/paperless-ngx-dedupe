<script lang="ts">
  import { BAND_META, confidenceBand, formatConfidence } from './confidence';

  interface Props {
    score: number;
    format?: 'percent' | 'decimal';
    /**
     * Drops the band word in a tight cell. The shape and the number stay, and
     * the word is still read by assistive technology.
     */
    compact?: boolean;
  }

  let { score, format = 'percent', compact = false }: Props = $props();

  const meta = $derived(BAND_META[confidenceBand(score)]);
  const display = $derived(formatConfidence(score, format));
</script>

<!-- Shape, word and number, in the band colour. No fill, no border: the
     legend (ConfidenceLegend) is printed once per screen, not per row. -->
<span class="status-word inline-flex items-baseline gap-1 tabular-nums {meta.text}">
  <span aria-hidden="true">{meta.shape}</span>
  {#if compact}
    <span class="sr-only">{meta.word}</span>
  {:else}
    <span class="uppercase">{meta.word}</span>
  {/if}
  <span>{display}</span>
</span>
