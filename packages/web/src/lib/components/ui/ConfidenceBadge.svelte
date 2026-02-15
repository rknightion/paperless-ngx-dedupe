<script lang="ts">
  interface Props {
    score: number;
    format?: 'percent' | 'decimal';
  }

  let { score, format = 'percent' }: Props = $props();

  let display = $derived(format === 'percent' ? `${Math.round(score * 100)}%` : score.toFixed(2));

  /* Static class map so Tailwind detects all variants */
  const colorMap = {
    green: 'bg-success-light text-success',
    yellow: 'bg-amber-100 text-amber-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-ember-light text-ember',
  } as const;

  let color = $derived(
    score >= 0.9
      ? colorMap.green
      : score >= 0.8
        ? colorMap.yellow
        : score >= 0.75
          ? colorMap.orange
          : colorMap.red,
  );

  let ringClass = $derived(score >= 0.9 ? 'ring-1 ring-success/30' : '');
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {color} {ringClass}"
>
  {display}
</span>
