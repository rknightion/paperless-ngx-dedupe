import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const collect = (globalThis as Record<string, unknown>).__otelPrometheusCollect as
    | (() => Promise<string>)
    | undefined;

  if (!collect) {
    return new Response('Prometheus metrics not enabled (set OTEL_PROMETHEUS_ENABLED=true)', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const metrics = await collect();
  return new Response(metrics, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
};
