import { trace, context, isSpanContextValid } from '@opentelemetry/api';
import pino from 'pino';
import type { Logger } from 'pino';

/**
 * Pino mixin that injects OpenTelemetry trace context into every log record.
 * Uses the @opentelemetry/api globalThis singleton directly, so it works
 * regardless of whether instrumentation-pino's ESM patching succeeded.
 * Returns {} when no SDK is registered (zero overhead).
 */
function otelMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  if (!isSpanContextValid(ctx)) return {};
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: `0${ctx.traceFlags.toString(16)}`.slice(-2),
  };
}

let rootLogger: Logger;

export function initLogger(level: string): Logger {
  rootLogger = pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin: otelMixin,
  });
  return rootLogger;
}

export function createLogger(name: string): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin: otelMixin,
    });
  }
  return rootLogger.child({ module: name });
}

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin: otelMixin,
    });
  }
  return rootLogger;
}

export type { Logger };
