import { sequence } from '@sveltejs/kit/hooks';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { createLogger } from '@paperless-dedupe/core';
import type { Handle } from '@sveltejs/kit';
import { getServerRuntime } from './runtime.server';

const handleCors: Handle = async ({ event, resolve }) => {
  // Only apply CORS to API routes
  if (!event.url.pathname.startsWith('/api/')) {
    return resolve(event);
  }

  const runtime = await getServerRuntime();
  const allowOrigin = runtime.config.CORS_ALLOW_ORIGIN;

  // Handle preflight
  if (event.request.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, tracestate',
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
  const runtime = await getServerRuntime();
  const logger = createLogger('http');
  event.locals.config = runtime.config;
  event.locals.logger = logger;
  event.locals.db = runtime.db;
  event.locals.sqlite = runtime.sqlite;

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

    if (response.status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
    }
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
