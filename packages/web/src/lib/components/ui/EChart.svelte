<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { EChartsOption, ECharts } from 'echarts';
  import type * as EChartsNS from 'echarts';
  import { theme } from '$lib/theme/ThemeStore.svelte';
  import { echartsTheme } from '$lib/theme/tokens';

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
  let echartsModule: typeof EChartsNS | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const THEME_NAME = 'm7kni';

  function build(echarts: typeof EChartsNS) {
    if (!container) return;

    // Registered from the live tokens rather than literals, so the palette
    // follows the light/dark swap. ECharts bakes theme values in at init(),
    // which is why a theme change disposes and rebuilds rather than
    // re-optioning an existing instance.
    echarts.registerTheme(THEME_NAME, echartsTheme());

    chart = echarts.init(container, THEME_NAME);
    chart.setOption(option);
    loading = false;
    onChartReady?.(chart);

    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(container);
  }

  function teardown() {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    chart?.dispose();
    chart = undefined;
  }

  onMount(() => {
    import('echarts').then((echarts) => {
      echartsModule = echarts;
      build(echarts);
    });

    return teardown;
  });

  // Rebuild on a theme change. `theme.resolved` is the read that makes this
  // reactive; the tokens themselves are plain CSS and cannot be tracked.
  let lastTheme = $state<string | undefined>(undefined);
  $effect(() => {
    const resolved = theme.resolved;
    if (!echartsModule || !chart) {
      lastTheme = resolved;
      return;
    }
    if (lastTheme === resolved) return;
    lastTheme = resolved;

    const mod = echartsModule;
    teardown();
    // Let the class change land on <html> before re-reading computed styles.
    void tick().then(() => build(mod));
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
