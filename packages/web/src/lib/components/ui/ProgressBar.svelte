<script lang="ts">
  interface Props {
    progress: number;
    message?: string;
    animated?: boolean;
  }

  let { progress, message = '', animated = true }: Props = $props();

  let pct = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));
  let isIndeterminate = $derived(pct === 0 && animated);
  let barColor = $derived(pct >= 100 ? 'bg-success' : 'bg-accent');
</script>

<div class="w-full">
  <div class="mb-1 flex items-center justify-between text-sm">
    <span class="text-muted">{message}</span>
    <span class="text-ink font-mono text-xs font-medium">{pct}%</span>
  </div>
  <div class="bg-soft h-3 w-full overflow-hidden rounded-full">
    {#if isIndeterminate}
      <div
        class="h-full w-full rounded-full"
        style="background: linear-gradient(90deg, transparent 0%, oklch(0.55 0.15 195 / 0.4) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite;"
      ></div>
    {:else}
      <div
        class="{barColor} h-full rounded-full {animated
          ? 'transition-all duration-300 ease-out'
          : ''}"
        style="width: {pct}%"
      ></div>
    {/if}
  </div>
</div>
