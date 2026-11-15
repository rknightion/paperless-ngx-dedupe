import { setTimeout as delay } from 'node:timers/promises';
import { createLogger } from '../logger.js';
import { notificationsTotal } from '../telemetry/metrics.js';
import { formatApprise, formatJson, formatNtfy, type NotificationEvent } from './format.js';

const logger = createLogger('notifications');
const formatters = { json: formatJson, ntfy: formatNtfy, apprise: formatApprise };

/** Environment-owned destination settings; never persist or log URL and header values. */
export interface NotificationConfig {
  NOTIFY_URL?: string;
  NOTIFY_FORMAT: keyof typeof formatters;
  NOTIFY_AUTH_HEADER?: string;
  ORIGIN?: string;
}

/** A null status means no HTTP response was received, including an unconfigured destination. */
export interface NotificationDelivery {
  delivered: boolean;
  status: number | null;
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  const requested = Number.isFinite(seconds)
    ? seconds * 1000
    : retryAfter === null
      ? 0
      : Date.parse(retryAfter) - Date.now();
  const backoff = attempt === 0 ? 1000 : 4000;
  return Math.min(
    10_000,
    Math.max(backoff, Number.isFinite(requested) ? requested : 0) + Math.random() * 250,
  );
}

/** Deliver with bounded retries, returning failure instead of throwing into a job. */
export async function sendNotification(
  config: NotificationConfig,
  event: NotificationEvent,
): Promise<NotificationDelivery> {
  if (!config.NOTIFY_URL) return { delivered: false, status: null };
  let status: number | null = null;
  try {
    const path = event.event === 'duplicates.new' ? '/duplicates' : '/activity';
    const payload = formatters[config.NOTIFY_FORMAT]({
      ...event,
      data: { ...event.data, url: config.ORIGIN ? new URL(path, config.ORIGIN).href : undefined },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      let retryAfter: string | null = null;
      try {
        const response = await fetch(config.NOTIFY_URL, {
          method: 'POST',
          headers: {
            ...payload.headers,
            ...(config.NOTIFY_AUTH_HEADER ? { Authorization: config.NOTIFY_AUTH_HEADER } : {}),
          },
          body: payload.body,
          signal: AbortSignal.timeout(10_000),
        });
        status = response.status;
        retryAfter = response.headers.get('Retry-After');
        // Discarding an unread response must not resend an already accepted notification.
        await response.body?.cancel().catch(() => {});
        if (response.ok) {
          notificationsTotal().add(1, { event: event.event, outcome: 'delivered' });
          return { delivered: true, status };
        }
      } catch {
        status = null;
      }
      if (attempt < 2) await delay(retryDelay(attempt, retryAfter));
    }
  } catch {
    // Formatting and destination errors have the same non-fatal delivery outcome.
  }
  notificationsTotal().add(1, { event: event.event, outcome: 'failed' });
  logger.warn({ event: event.event, status }, 'Notification delivery failed');
  return { delivered: false, status };
}
