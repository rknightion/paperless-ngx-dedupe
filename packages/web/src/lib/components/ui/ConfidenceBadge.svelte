<script lang="ts">
  interface Props {
    score: number;
    format?: 'percent' | 'decimal';
  }

  let { score, format = 'percent' }: Props = $props();

  let display = $derived(format === 'percent' ? `${Math.round(score * 100)}%` : score.toFixed(2));

  /**
   * Three bands, because the design system fixes the semantic palette at
   * success / warn / ember and forbids inventing a fourth hue. This previously
   * had four, with the middle two on raw `amber-*` and `orange-*` Tailwind
   * classes — off-token, and the two were near-indistinguishable anyway.
   *
   * Always a tinted pill, never a solid fill: the brand accent is green and so
   * is success, so state and action are told apart by treatment, not hue.
   *
   * Static class strings so Tailwind sees every variant.
   */
  const BANDS = {
    high: 'bg-success-light text-success',
    medium: 'bg-warn-light text-warn',
    low: 'bg-ember-light text-ember',
  } as const;

  let band = $derived(score >= 0.9 ? BANDS.high : score >= 0.75 ? BANDS.medium : BANDS.low);

  let ringClass = $derived(score >= 0.9 ? 'ring-1 ring-success/30' : '');
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {band} {ringClass}"
>
  {display}
</span>
