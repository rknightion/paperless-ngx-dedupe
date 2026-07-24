export const DIAGNOSTIC_READINESS_CATEGORIES = [
  'ready',
  'configured',
  'degraded',
  'unavailable',
  'disabled',
  'unknown',
] as const;

export type DiagnosticReadinessCategory = (typeof DIAGNOSTIC_READINESS_CATEGORIES)[number];

export const DIAGNOSTIC_JOB_CATEGORIES = [
  'sync',
  'analysis',
  'batch_operation',
  'ai_processing',
  'ai_apply',
  'ai_revert',
] as const;

export type DiagnosticJobCategory = (typeof DIAGNOSTIC_JOB_CATEGORIES)[number] | 'other';
export type DiagnosticOutcome = 'completed' | 'failed' | 'cancelled';

const VERSION_PATTERN =
  /^v?(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:-(?:alpha|beta|rc|dev|canary)(?:\.\d{1,6})?)?$/;
const readinessCategories = new Set<string>(DIAGNOSTIC_READINESS_CATEGORIES);
const jobCategories = new Set<string>(DIAGNOSTIC_JOB_CATEGORIES);
const outcomes = new Set<string>(['completed', 'failed', 'cancelled']);

export function redactDiagnosticVersion(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';

  const metadataSeparator = value.indexOf('+');
  if (metadataSeparator === value.length - 1) return 'unknown';
  if (metadataSeparator >= 0 && value.indexOf('+', metadataSeparator + 1) >= 0) return 'unknown';

  const versionWithoutMetadata = metadataSeparator >= 0 ? value.slice(0, metadataSeparator) : value;
  return VERSION_PATTERN.test(versionWithoutMetadata) ? versionWithoutMetadata : 'unknown';
}

export function redactReadinessCategory(value: unknown): DiagnosticReadinessCategory {
  return typeof value === 'string' && readinessCategories.has(value)
    ? (value as DiagnosticReadinessCategory)
    : 'unknown';
}

export function redactJobCategory(value: unknown): DiagnosticJobCategory {
  return typeof value === 'string' && jobCategories.has(value)
    ? (value as DiagnosticJobCategory)
    : 'other';
}

export function redactOutcome(value: unknown): DiagnosticOutcome | null {
  return typeof value === 'string' && outcomes.has(value) ? (value as DiagnosticOutcome) : null;
}
