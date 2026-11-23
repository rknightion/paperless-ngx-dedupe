/**
 * The one definition of the three confidence bands. ConfidenceBadge,
 * ConfidenceBreakdown, ConfidenceTooltipContent and ConfidenceLegend all read
 * from here, so the thresholds and the shape, word and colour for each band
 * cannot drift apart.
 *
 * Every band carries a shape, a word and a colour. Colour is never the only
 * carrier, and the shape is never dropped.
 */
export type ConfidenceBand = 'high' | 'medium' | 'low';

/** A score at or above this is high. */
export const HIGH_MIN = 0.9;
/** A score at or above this, and below HIGH_MIN, is medium. */
export const MEDIUM_MIN = 0.75;

export const BAND_META = {
  high: { shape: '■', word: 'High', text: 'text-success', fill: 'bg-success' },
  medium: { shape: '◆', word: 'Medium', text: 'text-warn', fill: 'bg-warn' },
  low: { shape: '●', word: 'Low', text: 'text-ember', fill: 'bg-ember' },
} as const;

export function confidenceBand(score: number): ConfidenceBand {
  return score >= HIGH_MIN ? 'high' : score >= MEDIUM_MIN ? 'medium' : 'low';
}

/** One decimal place for a percentage, two for a decimal score. */
export function formatConfidence(score: number, format: 'percent' | 'decimal' = 'percent'): string {
  return format === 'percent' ? `${(score * 100).toFixed(1)}%` : score.toFixed(2);
}
