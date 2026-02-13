import type { APIRequestContext } from '@playwright/test';

export interface SSEEvent {
  event: string;
  data: string;
}

export async function collectSSEEvents(
  request: APIRequestContext,
  url: string,
  options?: { maxEvents?: number; timeoutMs?: number },
): Promise<SSEEvent[]> {
  const maxEvents = options?.maxEvents ?? 50;
  const _timeoutMs = options?.timeoutMs ?? 5000;

  const events: SSEEvent[] = [];
  const response = await request.get(url, {
    headers: { Accept: 'text/event-stream' },
  });

  const body = await response.text();
  const lines = body.split('\n');

  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
    } else if (line === '' && (currentEvent || currentData)) {
      events.push({ event: currentEvent || 'message', data: currentData });
      currentEvent = '';
      currentData = '';
      if (events.length >= maxEvents) break;
    }
  }

  return events;
}
