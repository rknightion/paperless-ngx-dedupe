<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    value: string | number;
    /** Kept so existing call sites compile. v2 has no trend arrows: the note says it in words. */
    trend?: 'up' | 'down' | 'neutral';
    /** Mono note beneath the figure. Say the change in words and numbers. */
    trendLabel?: string;
    /** Rendered small and muted beside the label. */
    icon?: Snippet;
    class?: string;
  }

  let { label, value, trendLabel, icon, class: className = '' }: Props = $props();
</script>

<!-- One cell of the stat strip: divided by 1px rules, no card, no tile. The
     parent lays the cells out, four at most. -->
<div class="border-border min-w-0 border-l px-6 py-3 first:border-l-0 {className}">
  <p class="label-micro flex items-center gap-1.5">
    {#if icon}<span class="inline-flex" aria-hidden="true">{@render icon()}</span>{/if}
    {label}
  </p>
  <p class="text-ink mt-1 text-2xl font-semibold tabular-nums">{value}</p>
  {#if trendLabel}
    <p class="text-muted mt-0.5 font-mono text-xs tabular-nums">{trendLabel}</p>
  {/if}
</div>
