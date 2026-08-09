import { browser } from '$app/environment';

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
  '--color-chart-1': 'oklch(0.52 0.16 300)',
  '--color-chart-2': 'oklch(0.55 0.14 245)',
  '--color-chart-3': 'oklch(0.55 0.1 205)',
  '--color-chart-4': 'oklch(0.58 0.13 70)',
  '--color-chart-5': 'oklch(0.58 0.16 10)',
  '--color-chart-6': 'oklch(0.55 0.1 130)',
  '--color-accent': 'oklch(0.49 0.13 165)',
  '--color-accent-product': 'oklch(0.53 0.16 300)',
  '--color-success': 'oklch(0.49 0.15 155)',
  '--color-warn': 'oklch(0.52 0.15 85)',
  '--color-ember': 'oklch(0.52 0.2 25)',
  '--color-ink': 'oklch(0.2 0.02 260)',
  '--color-ink-light': 'oklch(0.35 0.02 260)',
  '--color-muted': 'oklch(0.55 0.015 260)',
  '--color-soft': 'oklch(0.885 0.009 85)',
  '--color-border': 'oklch(0.9 0.007 85)',
  '--color-surface': 'oklch(1 0 0)',
  '--color-canvas': 'oklch(0.975 0.006 85)',
  '--color-canvas-deep': 'oklch(0.945 0.009 85)',
};

/** Read one token off <html>. Returns the light-scope fallback off the browser. */
export function readToken(name: string): string {
  if (!browser) return FALLBACKS[name] ?? '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || (FALLBACKS[name] ?? '');
}

/**
 * The six-series chart ramp, in order. Series 1 is violet rather than the
 * brand accent, so a single-series chart never reads as a primary action.
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

  return {
    color: chartPalette(),
    backgroundColor: 'transparent',
    textStyle: { color: ink },
    title: { textStyle: { color: readToken('--color-ink') } },
    legend: { textStyle: { color: muted } },
    tooltip: {
      backgroundColor: readToken('--color-surface'),
      borderColor: border,
      textStyle: { color: ink },
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { lineStyle: { color: border } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: border } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { lineStyle: { color: border } },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: border } },
    },
  };
}
