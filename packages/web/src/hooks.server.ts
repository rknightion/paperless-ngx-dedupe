import { sequence } from '@sveltejs/kit/hooks';
import { trace } from '@opentelemetry/api';
import {
  parseConfig,
  initLogger,
  createLogger,
  PaperlessClient,
  PaperlessMetricsCoordinator,
  toPaperlessConfig,
} from '@paperless-dedupe/core';
import type { Handle } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/db';

// Graceful shutdown handlers
if (typeof process !== 'undefined') {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      setTimeout(() => process.exit(1), 25_000).unref(); // safety net inside Docker's 30s stop_grace_period
    });
  }
}

// Singleton initialization
let config: ReturnType<typeof parseConfig> | undefined;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  config = parseConfig(process.env as Record<string, string | undefined>);
  initLogger(config.LOG_LEVEL);

  if (process.env.OTEL_ENABLED === 'true' && config.PAPERLESS_METRICS_ENABLED) {
    const metricsClient = new PaperlessClient({
      ...toPaperlessConfig(config),
      timeout: 10_000,
      maxRetries: 0,
    });
    const coordinator = new PaperlessMetricsCoordinator({
      client: metricsClient,
      enabledCollectors: config.PAPERLESS_METRICS_COLLECTORS
        ? config.PAPERLESS_METRICS_COLLECTORS.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    });
    coordinator.start();

    if (typeof process !== 'undefined') {
      process.on('SIGTERM', () => coordinator.shutdown());
    }
  }

  initialized = true;
}

const handleCors: Handle = async ({ event, resolve }) => {
  // Only apply CORS to API routes
  if (!event.url.pathname.startsWith('/api/')) {
    return resolve(event);
  }

  ensureInitialized();
  const allowOrigin = config!.CORS_ALLOW_ORIGIN;

  // Handle preflight
  if (event.request.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    if (allowOrigin === '*') {
      headers['Access-Control-Allow-Origin'] = '*';
    } else if (allowOrigin) {
      headers['Access-Control-Allow-Origin'] = allowOrigin;
      headers['Vary'] = 'Origin';
    }

    return new Response(null, { status: 204, headers });
  }

  const response = await resolve(event);

  // No CORS headers for empty origin (same-origin only)
  if (!allowOrigin) return response;

  // Clone response to avoid immutable header issues
  const newResponse = new Response(response.body, response);
  if (allowOrigin === '*') {
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    newResponse.headers.set('Access-Control-Allow-Origin', allowOrigin);
    newResponse.headers.append('Vary', 'Origin');
  }

  return newResponse;
};

const handleRequest: Handle = async ({ event, resolve }) => {
  ensureInitialized();

  const logger = createLogger('http');
  event.locals.config = config!;
  event.locals.logger = logger;
  event.locals.db = await getDatabase(config!);

  const start = performance.now();
  const response = await resolve(event);
  const duration = Math.round(performance.now() - start);

  // Enrich the HTTP instrumentation span with SvelteKit route info.
  // Without this, spans have generic names like "GET"; with it they get
  // descriptive names like "GET /duplicates/[id]".
  const span = trace.getActiveSpan();
  if (span) {
    const routeId = event.route.id ?? event.url.pathname;
    span.setAttribute('http.route', routeId);
    span.updateName(`${event.request.method} ${routeId}`);
  }

  logger.info(
    {
      method: event.request.method,
      path: event.url.pathname,
      status: response.status,
      duration,
    },
    `${event.request.method} ${event.url.pathname} ${response.status} ${duration}ms`,
  );

  return response;
};

export const handle = sequence(handleCors, handleRequest);
