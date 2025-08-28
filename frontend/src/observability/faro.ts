import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// Initialize Grafana Faro SDK as early as possible.
// Replace placeholder values in initializeFaro config from your environment later.
export function initializeFrontendObservability(): void {
  // Avoid double initialization in Vite HMR or StrictMode
  if ((window as any).__faroInitialized) return;

  initializeFaro({
    url: 'https://faro-collector-prod-gb-south-1.grafana.net/collect/311bfe30cb76bce165c6cf7cc298914a',
    app: {
      name: 'paperless-dedupe',
      version: import.meta.env?.VITE_APP_VERSION ?? 'dev',
      environment: import.meta.env?.VITE_APP_ENV ?? 'development',
    },
    // Capture console logs, errors, performance, web vitals, fetch/xhr, and session
    instrumentations: [
      // Built-ins: errors, console, web-vitals, page, performance, fetch/xhr, session
      ...getWebInstrumentations(),
      // OpenTelemetry tracing bridge for user interactions/navigation/fetch spans
      new TracingInstrumentation(),
    ],
    // Enable sampling configuration via env later if needed
    // sampling: { tracesSampleRate: 1.0 },
  });

  (window as any).__faroInitialized = true;
}
