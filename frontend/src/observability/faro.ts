import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// Initialize Grafana Faro SDK as early as possible.
// Replace placeholder values in initializeFaro config from your environment later.
export function initializeFrontendObservability(): void {
  // Avoid double initialization in Vite HMR or StrictMode
  if ((window as any).__faroInitialized) return;

  const apiBase =
    import.meta.env?.VITE_API_BASE_URL || window.location.origin || '';
  const appVersion = import.meta.env?.VITE_APP_VERSION ?? 'dev';
  const appEnvironment = import.meta.env?.VITE_APP_ENV ?? 'development';
  const faroUrl = import.meta.env?.VITE_FARO_URL;
  const faroEnabled =
    (import.meta.env?.VITE_FARO_ENABLED ?? 'true').toLowerCase() === 'true';
  const faroApiKey = import.meta.env?.VITE_FARO_API_KEY;
  const faroAppName = import.meta.env?.VITE_FARO_APP_NAME ?? 'paperless-dedupe';
  const faroNamespace = import.meta.env?.VITE_FARO_NAMESPACE ?? 'paperless-ngx';

  if (!faroEnabled) {
    return;
  }

  if (!faroUrl) {
    console.warn(
      '[observability] Faro disabled: VITE_FARO_URL is not configured'
    );
    return;
  }

  initializeFaro({
    url: faroUrl,
    apiKey: faroApiKey,
    app: {
      name: faroAppName,
      namespace: faroNamespace,
      version: appVersion,
      environment: appEnvironment,
    },
    // Capture console logs, errors, performance, web vitals, fetch/xhr, and session
    instrumentations: [
      // Built-ins: errors, console, web-vitals, page, performance, fetch/xhr, session
      ...getWebInstrumentations(),
      // OpenTelemetry tracing bridge for user interactions/navigation/fetch spans
      new TracingInstrumentation({
        resourceAttributes: {
          'service.name': 'paperless-dedupe-frontend',
          'service.namespace': 'paperless-ngx',
          'deployment.environment': appEnvironment,
          'service.version': appVersion,
        },
        instrumentationOptions: {
          // Ensure traceparent is propagated to backend so traces can be correlated end-to-end
          propagateTraceHeaderCorsUrls: [apiBase, /\/api\//],
          fetchInstrumentationOptions: {
            ignoreNetworkEvents: false,
          },
          xhrInstrumentationOptions: {
            ignoreNetworkEvents: false,
          },
        },
      }),
    ],
    // Enable sampling configuration via env later if needed
    // sampling: { tracesSampleRate: 1.0 },
  });

  (window as any).__faroInitialized = true;
}
