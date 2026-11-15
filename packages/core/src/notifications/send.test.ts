import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { sendNotification } from './send.js';
import type { NotificationEvent } from './format.js';

const logging = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('../logger.js', () => ({ createLogger: () => logging }));

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
const provider = new MeterProvider({ readers: [reader] });
beforeAll(() => {
  metrics.setGlobalMeterProvider(provider);
});
afterAll(async () => {
  metrics.disable();
  await provider.shutdown();
});

async function deliveryCounts() {
  const { resourceMetrics } = await reader.collect();
  return (
    resourceMetrics.scopeMetrics
      .flatMap(({ metrics: instruments }) => instruments)
      .find(({ descriptor }) => descriptor.name === 'paperless_ngx_dedupe.notifications_total')
      ?.dataPoints.map(({ attributes, value }) => ({ attributes, value })) ?? []
  );
}

const event: NotificationEvent = {
  event: 'duplicates.new',
  occurredAt: '2026-07-24T12:00:00.000Z',
  data: {
    jobId: 'synthetic-job',
    jobType: 'analysis',
    newGroups: 3,
    pendingGroups: 7,
    highConfidencePending: 2,
  },
};

afterEach(() => vi.clearAllMocks());

describe('notification delivery', () => {
  it('does not resend a successful delivery when discarding its response body fails', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('Synthetic response stream failure'));
        },
      }),
      { status: 202 },
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      await expect(
        sendNotification(
          { NOTIFY_URL: 'https://notify.example.test/topic', NOTIFY_FORMAT: 'json' },
          event,
        ),
      ).resolves.toEqual({ delivered: true, status: 202 });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  }, 15_000);

  it('retries a 503 three times and returns failure without logging destination credentials', async () => {
    const requests: Array<{ authorization?: string; body: string }> = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      });
      response.writeHead(503).end('Synthetic unavailable destination');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const destination = `http://127.0.0.1:${address.port}/synthetic-secret-path`;
    const authorization = 'Bearer synthetic-notification-secret';
    try {
      await expect(
        sendNotification(
          {
            NOTIFY_URL: destination,
            NOTIFY_FORMAT: 'json',
            NOTIFY_AUTH_HEADER: authorization,
            ORIGIN: 'https://app.example.test',
          },
          event,
        ),
      ).resolves.toEqual({ delivered: false, status: 503 });
      expect(requests).toEqual(
        Array.from({ length: 3 }, () => ({
          authorization,
          body: JSON.stringify({
            ...event,
            data: { ...event.data, url: 'https://app.example.test/duplicates' },
          }),
        })),
      );
      const logs = JSON.stringify([
        logging.warn.mock.calls,
        logging.info.mock.calls,
        logging.error.mock.calls,
      ]);
      expect(logs).not.toContain(destination);
      expect(logs).not.toContain('synthetic-secret-path');
      expect(logs).not.toContain(authorization);
      expect(await deliveryCounts()).toContainEqual({
        attributes: { event: 'duplicates.new', outcome: 'failed' },
        value: 1,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 15_000);

  it('honors Retry-After and sends ntfy without a caller-supplied link before recording one delivery', async () => {
    const requests: Array<{
      at: number;
      title?: string;
      click?: string;
      authorization?: string;
      body: string;
    }> = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        at: performance.now(),
        title: request.headers.title as string | undefined,
        click: request.headers.click as string | undefined,
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      });
      if (requests.length < 3)
        response
          .writeHead(503, {
            'Retry-After': requests.length === 1 ? '2' : new Date(Date.now() + 5000).toUTCString(),
          })
          .end();
      else response.writeHead(202).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    try {
      expect(
        await sendNotification(
          { NOTIFY_URL: `http://127.0.0.1:${address.port}/topic`, NOTIFY_FORMAT: 'ntfy' },
          {
            event: 'job.failed',
            occurredAt: event.occurredAt,
            data: { jobId: 'synthetic-job', jobType: 'sync', url: 'https://caller.example.test' },
          },
        ),
      ).toEqual({ delivered: true, status: 202 });
      expect(
        requests.map(({ title, click, authorization, body }) => ({
          title,
          click,
          authorization,
          body,
        })),
      ).toEqual(
        Array.from({ length: 3 }, () => ({
          title: 'Job failed',
          click: undefined,
          authorization: undefined,
          body: 'A background job failed. Open Activity for details.',
        })),
      );
      expect(requests[1].at - requests[0].at).toBeGreaterThanOrEqual(2000);
      expect(requests[2].at - requests[1].at).toBeGreaterThanOrEqual(4000);
      expect(await deliveryCounts()).toContainEqual({
        attributes: { event: 'job.failed', outcome: 'delivered' },
        value: 1,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 20_000);

  it('makes no outbound request or delivery metric when the destination is unset', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'));
    try {
      const before = await deliveryCounts();
      await expect(sendNotification({ NOTIFY_FORMAT: 'json' }, event)).resolves.toEqual({
        delivered: false,
        status: null,
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(await deliveryCounts()).toEqual(before);
    } finally {
      fetch.mockRestore();
    }
  }, 15_000);

  it('bounds each attempt with a ten-second timeout and never logs exception credentials', async () => {
    const secret = 'synthetic-private-destination-and-auth';
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => AbortSignal.abort(new Error(secret)));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      throw init?.signal?.reason ?? new Error('Missing timeout');
    });
    try {
      await expect(
        sendNotification(
          { NOTIFY_URL: 'https://notify.example.test/topic', NOTIFY_FORMAT: 'json' },
          event,
        ),
      ).resolves.toEqual({ delivered: false, status: null });
      expect(timeout.mock.calls).toEqual([[10_000], [10_000], [10_000]]);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(
        JSON.stringify([
          logging.warn.mock.calls,
          logging.info.mock.calls,
          logging.error.mock.calls,
        ]),
      ).not.toContain(secret);
    } finally {
      fetch.mockRestore();
      timeout.mockRestore();
    }
  }, 15_000);
});
