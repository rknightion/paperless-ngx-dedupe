import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';
import { createJob, getJob } from '../jobs/manager.js';
import { runWorkerTaskWithData } from '../jobs/worker-entry.js';
import { setConfigBatch } from '../queries/config.js';
import { JobType } from '../types/enums.js';
import { type NotificationEvent } from './format.js';

afterEach(() => vi.unstubAllEnvs());

async function fail(
  options: {
    triggerKind?: string;
    settings?: Record<string, unknown>;
    configured?: boolean;
    responseStatus?: number;
    error?: string;
    attempt?: number;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'notification-failure-'));
  const dbPath = join(directory, 'test.sqlite');
  const { db, sqlite } = createDatabaseWithHandle(dbPath);
  const requests: Array<{
    body: NotificationEvent;
    status: string | null | undefined;
    leaseCount: number;
  }> = [];
  let jobId = '';
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: JSON.parse(Buffer.concat(chunks).toString()),
      status: getJob(db, jobId)?.status,
      leaseCount: (
        sqlite
          .prepare('SELECT count(*) AS count FROM operation_lease WHERE owner_id = ?')
          .get(jobId) as { count: number }
      ).count,
    });
    response.writeHead(options.responseStatus ?? 204).end();
  });
  try {
    await migrateDatabase(sqlite);
    setConfigBatch(db, options.settings ?? {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    vi.stubEnv('PAPERLESS_URL', 'https://paperless.example.test');
    vi.stubEnv('PAPERLESS_API_TOKEN', 'synthetic-token');
    vi.stubEnv(
      'NOTIFY_URL',
      options.configured === false ? undefined : `http://127.0.0.1:${address.port}/topic`,
    );
    vi.stubEnv('NOTIFY_FORMAT', 'json');
    vi.stubEnv('ORIGIN', 'https://app.example.test');
    jobId = createJob(db, JobType.ANALYSIS);
    sqlite
      .prepare('UPDATE job SET trigger_kind = ?, attempt = ? WHERE id = ?')
      .run(options.triggerKind ?? 'schedule', options.attempt ?? 0, jobId);
    await runWorkerTaskWithData(
      async () => {
        throw new Error(options.error ?? 'Synthetic permanent failure');
      },
      { jobId, dbPath, executionToken: 'synthetic-owner' },
    );
    return { jobId, requests, job: getJob(db, jobId) };
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

it('notifies once after a scheduled job fails and releases its lease without disclosing the error', async () => {
  const { jobId, requests, job } = await fail();
  expect(job?.status).toBe('failed');
  expect(requests).toEqual([
    {
      body: {
        event: 'job.failed',
        occurredAt: expect.any(String),
        data: { jobId, jobType: 'analysis', url: 'https://app.example.test/activity' },
      },
      status: 'failed',
      leaseCount: 0,
    },
  ]);
}, 15000);

it('keeps manual failures quiet unless scheduledRunsOnly is disabled', async () => {
  const quiet = await fail({ triggerKind: 'manual' });
  expect(quiet.job?.status).toBe('failed');
  expect(quiet.requests).toEqual([]);
  const optedIn = await fail({
    triggerKind: 'manual',
    settings: { 'notifications.scheduledRunsOnly': false },
  });
  expect(optedIn.requests.map(({ body }) => body.event)).toEqual(['job.failed']);
}, 15000);

it('honors the disabled job-failure preference', async () => {
  const result = await fail({ settings: { 'notifications.onJobFailure': false } });
  expect(result.job?.status).toBe('failed');
  expect(result.requests).toEqual([]);
}, 15000);

it('does not notify for a transient failure while the job is pending a retry', async () => {
  const result = await fail({ error: 'Synthetic network failure' });
  expect(result.job).toMatchObject({ status: 'pending', attempt: 1, completedAt: null });
  expect(result.requests).toEqual([]);
}, 15000);

it('notifies for an exhausted transient failure and scheduled dependencies', async () => {
  const result = await fail({
    error: 'Synthetic network failure',
    attempt: 3,
    triggerKind: 'dependency',
  });
  expect(result.job).toMatchObject({
    status: 'failed',
    terminalReason: 'automated_retry_exhausted',
  });
  expect(result.requests.map(({ body }) => body.event)).toEqual(['job.failed']);
}, 15000);

it('makes no outbound request after failure when the destination is unset', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const result = await fail({ configured: false });
    expect(result.job?.status).toBe('failed');
    expect(result.requests).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
}, 15000);

it('preserves the original failure and released lease during failed delivery retries', async () => {
  const result = await fail({ responseStatus: 503 });
  expect(result.job).toMatchObject({
    status: 'failed',
    errorMessage: 'Synthetic permanent failure',
  });
  expect(result.requests.map(({ status, leaseCount }) => ({ status, leaseCount }))).toEqual(
    Array.from({ length: 3 }, () => ({ status: 'failed', leaseCount: 0 })),
  );
}, 15000);
