import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const exporter = (globalThis as Record<string, unknown>).__otelPrometheusExporter as
    | { getMetricsRequestHandler: (req: unknown, res: unknown) => void }
    | undefined;

  if (!exporter) {
    return new Response('Prometheus metrics not enabled (set OTEL_PROMETHEUS_ENABLED=true)', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // PrometheusExporter expects Node.js req/res objects. Create a minimal mock
  // response to capture the serialized Prometheus text output.
  const { status, contentType, body } = await new Promise<{
    status: number;
    contentType: string;
    body: string;
  }>((resolve) => {
    let statusCode = 200;
    let ct = 'text/plain';
    const res = {
      set statusCode(code: number) {
        statusCode = code;
      },
      setHeader(name: string, value: string) {
        if (name === 'content-type') ct = value;
      },
      end(data?: string) {
        resolve({ status: statusCode, contentType: ct, body: data ?? '' });
      },
    };
    exporter.getMetricsRequestHandler({}, res);
  });

  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
};
