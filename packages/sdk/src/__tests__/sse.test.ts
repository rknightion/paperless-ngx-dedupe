import { describe, it, expect, vi } from 'vitest';
import { subscribeToJobProgress } from '../sse.js';
import { PaperlessDedupeNetworkError } from '../errors.js';
import type { HttpOptions } from '../http.js';

function makeHttpOptions(fetchFn: typeof globalThis.fetch): HttpOptions {
  return {
    baseUrl: 'http://localhost:3000',
    fetch: fetchFn,
    timeout: 5000,
  };
}

function createSSEStream(events: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
}

function createMockSSEFetch(events: string, status = 200) {
  return vi.fn<typeof globalThis.fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: createSSEStream(events),
  } as unknown as Response);
}

function waitForCallbacks(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('subscribeToJobProgress', () => {
  it('parses progress events', async () => {
    const events = 'event:progress\ndata:{"progress":0.5,"message":"Processing"}\n\n';
    const mockFetch = createMockSSEFetch(events);

    const onProgress = vi.fn();
    subscribeToJobProgress('job-1', { onProgress }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onProgress).toHaveBeenCalledWith({ progress: 0.5, message: 'Processing' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/jobs/job-1/progress',
      expect.objectContaining({ headers: { Accept: 'text/event-stream' } }),
    );
  });

  it('parses complete events', async () => {
    const events = 'event:complete\ndata:{"status":"completed","result":{"count":5}}\n\n';
    const mockFetch = createMockSSEFetch(events);

    const onComplete = vi.fn();
    subscribeToJobProgress('job-1', { onComplete }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onComplete).toHaveBeenCalledWith({
      status: 'completed',
      result: { count: 5 },
    });
  });

  it('handles multiple events in sequence', async () => {
    const events = [
      'event:progress\ndata:{"progress":0.25}\n\n',
      'event:progress\ndata:{"progress":0.75}\n\n',
      'event:complete\ndata:{"status":"completed"}\n\n',
    ].join('');
    const mockFetch = createMockSSEFetch(events);

    const onProgress = vi.fn();
    const onComplete = vi.fn();
    subscribeToJobProgress('job-1', { onProgress, onComplete }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, { progress: 0.25 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { progress: 0.75 });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed JSON in data', async () => {
    const events = 'event:progress\ndata:{invalid json}\n\n';
    const mockFetch = createMockSSEFetch(events);

    const onProgress = vi.fn();
    subscribeToJobProgress('job-1', { onProgress }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('calls onError on HTTP error response', async () => {
    const mockFetch = createMockSSEFetch('', 500);

    const onError = vi.fn();
    subscribeToJobProgress('job-1', { onError }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PaperlessDedupeNetworkError);
  });

  it('calls onError on network failure', async () => {
    const mockFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const onError = vi.fn();
    subscribeToJobProgress('job-1', { onError }, makeHttpOptions(mockFetch));

    await waitForCallbacks();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PaperlessDedupeNetworkError);
  });

  it('returns unsubscribe function that aborts', async () => {
    const events = 'event:progress\ndata:{"progress":0.5}\n\n';
    const mockFetch = createMockSSEFetch(events);

    const subscription = subscribeToJobProgress('job-1', {}, makeHttpOptions(mockFetch));

    expect(subscription).toHaveProperty('unsubscribe');
    expect(typeof subscription.unsubscribe).toBe('function');
    subscription.unsubscribe();
  });

  it('does not call onError after unsubscribe', async () => {
    // Fetch that never resolves, so we can unsubscribe before it completes
    const neverResolve = vi.fn<typeof globalThis.fetch>().mockImplementation(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new Error('abort')), 100);
        }),
    );

    const onError = vi.fn();
    const sub = subscribeToJobProgress('job-1', { onError }, makeHttpOptions(neverResolve));

    // Unsubscribe immediately
    sub.unsubscribe();

    await waitForCallbacks(150);

    // onError should not be called since we unsubscribed
    expect(onError).not.toHaveBeenCalled();
  });
});
