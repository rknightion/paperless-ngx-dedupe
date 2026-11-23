import { applySecurityHeaders } from '$lib/server/security-headers';
import { decideAccess } from '$lib/server/access';
import { isAllowedHost, isSameHostOrigin } from '$lib/server/host-policy';
import { isApiRequest, routedPathname } from '$lib/server/request-path';
import { apiError, ErrorCode } from '$lib/server/api';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { createLogger } from '@paperless-dedupe/core';
import { getServerRuntime } from './runtime.server';

const handleSecurityHeaders: Handle = async ({ event, resolve }) =>
  applySecurityHeaders(await resolve(event));

const handleCsrf: Handle = async ({ event, resolve }) => {
  const { request } = event;
  const isApi = isApiRequest(event);
  const runtime = await getServerRuntime();
  const host = request.headers.get('host');
  if (
    !isAllowedHost(host, {
      origin: process.env.ORIGIN,
      allowedHosts: runtime.config.ALLOWED_HOSTS,
    })
  ) {
    createLogger('http').warn(
      { host: host?.slice(0, 100) },
      'Refused a request for a host that is not allowed; set ORIGIN or ALLOWED_HOSTS',
    );
    return isApi
      ? apiError(ErrorCode.VALIDATION_FAILED, { retryable: false }, 403)
      : new Response('Host not allowed. Set ORIGIN or ALLOWED_HOSTS.', { status: 403 });
  }
  if (!isApi) return resolve(event);
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return resolve(event);

  const origin = request.headers.get('origin');
  const allowedCorsOrigin = runtime.config.CORS_ALLOW_ORIGIN;
  const hasBody =
    request.body !== null ||
    Number(request.headers.get('content-length')) > 0 ||
    request.headers.has('transfer-encoding');
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin !== null &&
      origin !== event.url.origin &&
      !isSameHostOrigin(origin, host) &&
      !(allowedCorsOrigin && origin === allowedCorsOrigin)) ||
    (hasBody && mediaType !== 'application/json')
  ) {
    return apiError(ErrorCode.VALIDATION_FAILED, { retryable: false }, 403);
  }

  return resolve(event);
};

const handleCors: Handle = async ({ event, resolve }) => {
  // Only apply CORS to API routes
  if (!isApiRequest(event)) {
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

const handleAuth: Handle = async ({ event, resolve }) => {
  const { config } = await getServerRuntime();
  const decision = decideAccess(
    config,
    event.request.method,
    routedPathname(event.url.pathname),
    event.request.headers,
    // Forwarded address headers must never establish trust in the identity header.
    config.APP_AUTH_MODE === 'proxy' ? (event.platform?.req?.socket.remoteAddress ?? '') : '',
  );
  if (decision.allowed) return resolve(event);
  const response = isApiRequest(event)
    ? apiError(ErrorCode.UNAUTHORIZED, { operation: 'authenticate', retryable: false }, 401)
    : new Response('Authentication required', { status: 401 });
  response.headers.set(
    'WWW-Authenticate',
    config.APP_AUTH_MODE === 'basic' ? 'Basic realm="Paperless Dedupe", charset="UTF-8"' : 'Bearer',
  );
  return response;
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

export const handle = sequence(
  handleSecurityHeaders,
  handleCsrf,
  handleCors,
  handleAuth,
  handleRequest,
);
