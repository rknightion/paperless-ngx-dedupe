import { browser } from '$app/env';
import { theme } from './ThemeStore.svelte';

/**
 * Resolved design-system token values, for the places that cannot use a
 * `var()` reference.
 *
 * ECharts is the main one: it paints to a canvas via its own option object, so
 * it needs a colour *string*, not a custom property. Reading the token here
 * rather than hardcoding a literal keeps charts on the palette and lets them
 * follow the light/dark swap — but it means anything using these must re-read
 * them when the theme changes, because the value is a snapshot.
 */

/** Fallbacks match the light scope in app.css. Used during SSR, where there
 *  is no computed style to read. */
const FALLBACKS: Record<string, string> = {
  '--color-chart-1': 'oklch(0.44 0.095 233)',
  '--color-chart-2': 'oklch(0.48 0.115 281)',
  '--color-chart-3': 'oklch(0.52 0.105 329)',
  '--color-chart-4': 'oklch(0.56 0.115 17)',
  '--color-chart-5': 'oklch(0.57 0.1 65)',
  '--color-chart-6': 'oklch(0.6 0.095 161)',
  '--color-accent': '#1d6a8a',
  '--color-success': '#2b7148',
  '--color-warn': '#865d0f',
  '--color-ember': '#a83a2e',
  '--color-ink': 'oklch(0.24 0.012 227)',
  '--color-ink-light': 'oklch(0.37 0.015 227)',
  '--color-muted': 'oklch(0.5 0.018 227)',
  '--color-soft': 'oklch(0.9 0.008 227)',
  '--color-border': 'oklch(0.9 0.008 227)',
  '--color-surface': 'oklch(0.982 0.004 227)',
  '--color-surface-raised': 'oklch(1 0 0)',
  '--color-canvas': 'oklch(0.962 0.007 227)',
  '--color-canvas-deep': 'oklch(0.945 0.009 227)',
  '--font-sans': "'Hanken Grotesk', system-ui, sans-serif",
  '--font-mono': "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
};

/**
 * Read one token off <html>. Reactive callers track the resolved scheme, since
 * a computed CSS property does not itself invalidate chart options.
 */
export function readToken(name: string): string {
  if (!browser) return FALLBACKS[name] ?? '';
  void theme.resolved;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || (FALLBACKS[name] ?? '');
}

/**
 * The six-series chart ramp, in order (design system v2, derived from the
 * accent hue by rotation). Series 1 is petrol, the same family as the accent;
 * a chart is not an interactive control, so that is fine.
 */
export function chartPalette(): string[] {
  return [
    readToken('--color-chart-1'),
    readToken('--color-chart-2'),
    readToken('--color-chart-3'),
    readToken('--color-chart-4'),
    readToken('--color-chart-5'),
    readToken('--color-chart-6'),
  ];
}

/**
 * ECharts theme built from the current tokens. Re-read this on a theme change;
 * ECharts bakes theme values in at `init()`, so a chart must be disposed and
 * re-initialised rather than merely re-optioned.
 */
export function echartsTheme(): Record<string, unknown> {
  const ink = readToken('--color-ink-light');
  const muted = readToken('--color-muted');
  const border = readToken('--color-border');
  const mono = readToken('--font-mono');

  // Axis labels and legends are muted mono 11px; grid and axis lines use the
  // hairline border token. The tooltip is a raised surface with a hairline.
  const axis = {
    axisLine: { lineStyle: { color: border } },
    axisTick: { lineStyle: { color: border } },
    axisLabel: { color: muted, fontFamily: mono, fontSize: 11 },
    splitLine: { lineStyle: { color: border } },
  };

  return {
    color: chartPalette(),
    backgroundColor: 'transparent',
    textStyle: { color: ink, fontFamily: mono },
    title: { textStyle: { color: readToken('--color-ink') } },
    legend: { textStyle: { color: muted, fontFamily: mono, fontSize: 11 } },
    tooltip: {
      backgroundColor: readToken('--color-surface-raised'),
      borderColor: border,
      borderWidth: 1,
      textStyle: { color: ink, fontFamily: mono },
      extraCssText: 'border-radius: 6px;',
    },
    categoryAxis: axis,
    valueAxis: axis,
  };
}
