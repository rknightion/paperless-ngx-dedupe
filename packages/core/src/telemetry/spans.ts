import { trace, SpanStatusCode, context, type Span } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const TRACER_NAME = 'paperless-ngx-dedupe';
const LOGGER_NAME = 'paperless-ngx-dedupe.exceptions';

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

const otelLogger = logs.getLogger(LOGGER_NAME);

/**
 * Emit an exception as a log record correlated with the active span.
 * Replaces deprecated Span.recordException() per OTel March 2026 guidance.
 */
function emitExceptionLog(error: Error): void {
  otelLogger.emit({
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: error.message,
    context: context.active(),
    attributes: {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    },
  });
}

/**
 * Wraps an async function in an OpenTelemetry span with automatic error recording.
 * When no SDK is registered, the OTEL API returns no-op spans (zero overhead).
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      emitExceptionLog(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Wraps a synchronous function in an OpenTelemetry span.
 */
export function withSpanSync<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => T,
): T {
  return getTracer().startActiveSpan(name, { attributes }, (span) => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      emitExceptionLog(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
