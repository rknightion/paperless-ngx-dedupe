import { trace } from '@opentelemetry/api';
import type { Logger as DrizzleLogger } from 'drizzle-orm';

/**
 * Drizzle ORM logger that adds span events for DB queries to the active OTEL span.
 * Only fires when there's an active span — zero overhead otherwise.
 */
export class OtelDrizzleLogger implements DrizzleLogger {
  logQuery(query: string, _params: unknown[]): void {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) return;

    const operation = query.trimStart().split(/\s/)[0]?.toUpperCase() ?? 'UNKNOWN';

    activeSpan.addEvent('db.query', {
      'db.system': 'sqlite',
      'db.operation': operation,
      'db.statement': query.length > 200 ? query.slice(0, 200) + '...' : query,
    });
  }
}
