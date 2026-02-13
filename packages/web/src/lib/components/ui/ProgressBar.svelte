<script lang="ts">
  interface Props {
    progress: number;
    message?: string;
    animated?: boolean;
  }

  let { progress, message = '', animated = true }: Props = $props();

  let pct = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));
</script>

<div class="w-full">
  <div class="mb-1 flex items-center justify-between text-sm">
    <span class="text-muted">{message}</span>
    <span class="text-ink font-mono text-xs font-medium">{pct}%</span>
  </div>
  <div class="bg-soft h-2.5 w-full overflow-hidden rounded-full">
    <div
      class="bg-accent h-full rounded-full {animated ? 'transition-all duration-300 ease-out' : ''}"
      style="width: {pct}%"
    ></div>
  </div>
</div>
