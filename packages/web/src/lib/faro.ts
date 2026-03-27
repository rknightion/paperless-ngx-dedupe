import { faro, getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

export { faro };

export function initFaro(collectorUrl: string) {
  if (typeof window === 'undefined' || faro.api) return;

  initializeFaro({
    url: collectorUrl,
    app: {
      name: 'paperless-dedupe',
      version: '0.10.0',
      environment: import.meta.env.MODE,
    },
    instrumentations: [...getWebInstrumentations(), new TracingInstrumentation()],
    ignoreErrors: [
      /^ResizeObserver loop limit exceeded$/,
      /^ResizeObserver loop completed with undelivered notifications$/,
      /^Script error\.$/,
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    experimental: {
      trackNavigation: true,
    },
  });
}
