import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const exporter = (globalThis as Record<string, unknown>).__otelPrometheusExporter as
    | { collect: () => Promise<{ contentType: string; metrics: string }> }
    | undefined;

  if (!exporter) {
    return new Response('Prometheus metrics not enabled (set OTEL_PROMETHEUS_ENABLED=true)', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const { contentType, metrics } = await exporter.collect();
  return new Response(metrics, {
    headers: { 'Content-Type': contentType },
  });
};
