<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption, ECharts } from 'echarts';

  interface Props {
    option: EChartsOption;
    height?: string;
    class?: string;
    onChartReady?: (chart: ECharts) => void;
  }

  let { option, height = '300px', class: className = '', onChartReady }: Props = $props();

  let container: HTMLDivElement;
  let chart: ECharts | undefined;
  let loading = $state(true);

  onMount(() => {
    let resizeObserver: ResizeObserver | undefined;

    import('echarts').then((echarts) => {
      if (!container) return;

      // Register custom theme with chart palette
      echarts.registerTheme('paperless', {
        color: [
          'oklch(0.55 0.15 195)',
          'oklch(0.6 0.16 155)',
          'oklch(0.65 0.14 265)',
          'oklch(0.7 0.15 85)',
          'oklch(0.6 0.18 330)',
          'oklch(0.6 0.12 140)',
        ],
      });

      chart = echarts.init(container, 'paperless');
      chart.setOption(option);
      loading = false;
      onChartReady?.(chart);

      resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(container);
    });

    return () => {
      resizeObserver?.disconnect();
      chart?.dispose();
    };
  });

  $effect(() => {
    if (chart) {
      chart.setOption(option);
    }
  });
</script>

<div class="relative w-full {className}" style="height: {height}">
  {#if loading}
    <div
      class="bg-canvas-deep absolute inset-0 flex items-center justify-center rounded-lg"
      style="animation: pulse-soft 2s ease-in-out infinite;"
    >
      <span class="text-muted text-sm">Loading chart...</span>
    </div>
  {/if}
  <div bind:this={container} class="h-full w-full"></div>
</div>
