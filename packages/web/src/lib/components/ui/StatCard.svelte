<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'neutral';
    trendLabel?: string;
    icon?: Snippet;
  }

  let { label, value, trend, trendLabel, icon }: Props = $props();

  const trendColors = {
    up: 'text-success',
    down: 'text-ember',
    neutral: 'text-muted',
  } as const;

  const trendArrows = {
    up: '\u2191',
    down: '\u2193',
    neutral: '\u2192',
  } as const;
</script>

<div class="panel flex items-start gap-4">
  {#if icon}
    <div
      class="bg-accent-light text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
    >
      {@render icon()}
    </div>
  {/if}
  <div class="min-w-0 flex-1">
    <p class="text-muted text-sm">{label}</p>
    <p class="text-ink mt-1 text-2xl font-semibold">{value}</p>
    {#if trend && trendLabel}
      <p class="mt-1 text-xs {trendColors[trend]}">
        {trendArrows[trend]}
        {trendLabel}
      </p>
    {/if}
  </div>
</div>
