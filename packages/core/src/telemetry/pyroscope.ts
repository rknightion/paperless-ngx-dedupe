/**
 * Pyroscope label wrapper — adds profiling labels to code paths for
 * flame graph filtering. No-ops gracefully when Pyroscope is not initialized.
 *
 * Initialization happens in telemetry.cjs (web package) which sets
 * globalThis.__pyroscopeModule. This helper picks it up at import time
 * so core code can tag hot code paths without a direct dependency.
 */

type PyroscopeModule = {
  wrapWithLabels: (labels: Record<string, string>, fn: () => void) => void;
};

const pyroscope: PyroscopeModule | null =
  typeof globalThis !== 'undefined'
    ? (((globalThis as Record<string, unknown>).__pyroscopeModule as PyroscopeModule | undefined) ??
      null)
    : null;

/**
 * Wrap a function with Pyroscope labels for flame graph filtering.
 * No-ops when Pyroscope is not initialized (zero overhead).
 */
export function withPyroscopeLabels<T>(labels: Record<string, string>, fn: () => T): T {
  if (!pyroscope) return fn();
  let result: T;
  pyroscope.wrapWithLabels(labels, () => {
    result = fn();
  });
  return result!;
}
