/** Counts and job identifiers that may be sent to a configured notification destination. */
export interface NotificationEvent {
  event: 'duplicates.new' | 'job.failed';
  occurredAt: string;
  data: {
    jobId: string;
    jobType: string;
    newGroups?: number;
    pendingGroups?: number;
    highConfidencePending?: number;
    url?: string;
  };
}

/** An outbound notification payload, without destination or authentication secrets. */
export interface NotificationRequest {
  headers: Record<string, string>;
  body: string;
}

/** Restrict JSON notifications to the documented counts and link, even for untyped callers. */
export function formatJson(event: NotificationEvent): NotificationRequest {
  const { jobId, jobType, newGroups, pendingGroups, highConfidencePending, url } = event.data;
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: event.event,
      occurredAt: event.occurredAt,
      data: { jobId, jobType, newGroups, pendingGroups, highConfidencePending, url },
    }),
  };
}

function eventText(event: NotificationEvent): { title: string; body: string } {
  if (event.event === 'job.failed') {
    return { title: 'Job failed', body: 'A background job failed. Open Activity for details.' };
  }
  const { newGroups = 0, pendingGroups, highConfidencePending } = event.data;
  return {
    title: 'New duplicate groups',
    body:
      `${newGroups} new duplicate groups.` +
      (pendingGroups === undefined
        ? ''
        : ` ${pendingGroups} pending groups` +
          (highConfidencePending === undefined
            ? '.'
            : `, including ${highConfidencePending} high-confidence groups.`)),
  };
}

/** Send counts as plain text and let ntfy expose the optional application link. */
export function formatNtfy(event: NotificationEvent): NotificationRequest {
  const { title, body } = eventText(event);
  return {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Title: title,
      Tags: event.event === 'job.failed' ? 'warning' : 'mag',
      ...(event.data.url ? { Click: event.data.url } : {}),
    },
    body,
  };
}

/** Encode a count-only Apprise message; the link is text because Apprise has no Click header. */
export function formatApprise(event: NotificationEvent): NotificationRequest {
  const { title, body } = eventText(event);
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body: body + (event.data.url ? `\n${event.data.url}` : ''),
      type: event.event === 'job.failed' ? 'failure' : 'info',
    }),
  };
}
