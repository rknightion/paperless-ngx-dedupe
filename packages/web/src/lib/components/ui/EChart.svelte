<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption, ECharts } from 'echarts';

  interface Props {
    option: EChartsOption;
    height?: string;
    class?: string;
  }

  let { option, height = '300px', class: className = '' }: Props = $props();

  let container: HTMLDivElement;
  let chart: ECharts | undefined;

  onMount(() => {
    let resizeObserver: ResizeObserver | undefined;

    import('echarts').then((echarts) => {
      if (!container) return;
      chart = echarts.init(container);
      chart.setOption(option);

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

<div bind:this={container} class="w-full {className}" style="height: {height}"></div>
