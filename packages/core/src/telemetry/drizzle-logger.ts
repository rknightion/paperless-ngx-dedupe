import { context, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import type { Logger as DrizzleLogger } from 'drizzle-orm';

const LOGGER_NAME = 'paperless-ngx-dedupe.db';

/**
 * Drizzle ORM logger that emits OTel log records for DB queries.
 *
 * Uses the Logs API instead of deprecated Span.addEvent() — log records
 * are correlated with the active span via context automatically.
 * Zero overhead when no LoggerProvider is registered.
 */
export class OtelDrizzleLogger implements DrizzleLogger {
  private readonly otelLogger = logs.getLogger(LOGGER_NAME);

  logQuery(query: string, _params: unknown[]): void {
    // Skip if no active span — avoids emitting orphaned log records
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan || !activeSpan.isRecording()) return;

    const operation = query.trimStart().split(/\s/)[0]?.toUpperCase() ?? 'UNKNOWN';

    this.otelLogger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'db.query',
      context: context.active(),
      attributes: {
        'db.system.name': 'sqlite',
        'db.operation.name': operation,
        'db.query.text': query.length > 200 ? query.slice(0, 200) + '...' : query,
      },
    });
  }
}
