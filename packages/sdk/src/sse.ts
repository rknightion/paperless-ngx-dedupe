import { PaperlessDedupeNetworkError } from './errors.js';
import type { HttpOptions } from './http.js';
import type { SSECallbacks, SSESubscription } from './types.js';

export function subscribeToJobProgress(
  jobId: string,
  callbacks: SSECallbacks,
  httpOptions: HttpOptions,
): SSESubscription {
  const controller = new AbortController();

  const run = async () => {
    const url = `${httpOptions.baseUrl}/api/v1/jobs/${jobId}/progress`;

    let response: Response;
    try {
      response = await httpOptions.fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(
          new PaperlessDedupeNetworkError(
            err instanceof Error ? err.message : 'Network error',
            err,
          ),
        );
      }
      return;
    }

    if (!response.ok || !response.body) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(
          new PaperlessDedupeNetworkError(`SSE connection failed: HTTP ${response.status}`),
        );
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
          } else if (line === '') {
            if (currentEvent && currentData) {
              try {
                const parsed = JSON.parse(currentData);
                if (currentEvent === 'progress') {
                  callbacks.onProgress?.(parsed);
                } else if (currentEvent === 'complete') {
                  callbacks.onComplete?.(parsed);
                }
              } catch {
                // Ignore malformed JSON
              }
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(
          new PaperlessDedupeNetworkError(
            err instanceof Error ? err.message : 'Stream error',
            err,
          ),
        );
      }
    }
  };

  run();

  return {
    unsubscribe: () => controller.abort(),
  };
}
