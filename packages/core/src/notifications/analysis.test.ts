import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { cancelJob, createJob, getJob } from '../jobs/manager.js';
import { setConfigBatch } from '../queries/config.js';
import { type NotificationEvent } from './format.js';
import { JobType } from '../types/enums.js';
import { runWorkerTaskWithData, type TaskFunction } from '../jobs/worker-entry.js';
import type * as WorkerEntry from '../jobs/worker-entry.js';

const registration = vi.hoisted(() => ({ task: vi.fn() }));
vi.mock('../jobs/worker-entry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkerEntry>()),
  runWorkerTask: registration.task,
}));
afterEach(() => vi.unstubAllEnvs());
let analysisTask: TaskFunction | undefined;

async function analyze(
  options: {
    triggerKind?: string;
    settings?: Record<string, unknown>;
    configured?: boolean;
    responseStatus?: number;
    cancelBeforeCompletion?: boolean;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'notification-analysis-'));
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
    const text = Array.from({ length: 40 }, (_, index) => `synthetic${index}`).join(' ');
    for (const id of ['first', 'second']) {
      db.insert(document)
        .values({
          id,
          paperlessId: id === 'first' ? 1 : 2,
          title: 'Synthetic document',
          syncedAt: '2026-07-24T12:00:00Z',
        })
        .run();
      db.insert(documentContent)
        .values({ documentId: id, fullText: text, normalizedText: text, wordCount: 40 })
        .run();
    }
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
      .prepare('UPDATE job SET trigger_kind = ? WHERE id = ?')
      .run(options.triggerKind ?? 'schedule', jobId);
    if (!analysisTask) {
      await import('../jobs/workers/analysis-worker.js');
      analysisTask = registration.task.mock.calls[0][0] as TaskFunction;
    }
    await runWorkerTaskWithData(
      async (ctx, progress) => {
        const result = await analysisTask!(ctx, progress);
        if (options.cancelBeforeCompletion) cancelJob(db, jobId);
        return result;
      },
      { jobId, dbPath, executionToken: 'synthetic-owner' },
    );
    return {
      jobId,
      requests,
      status: getJob(db, jobId)?.status,
      result: JSON.parse(getJob(db, jobId)!.resultJson!),
    };
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

it('notifies once after a scheduled analysis completes and releases its operation lease', async () => {
  const { jobId, requests, status } = await analyze();
  expect(status).toBe('completed');
  expect(requests).toEqual([
    {
      body: {
        event: 'duplicates.new',
        occurredAt: expect.any(String),
        data: {
          jobId,
          jobType: 'analysis',
          newGroups: 1,
          pendingGroups: 1,
          highConfidencePending: 1,
          url: 'https://app.example.test/duplicates',
        },
      },
      status: 'completed',
      leaseCount: 0,
    },
  ]);
}, 15000);

it('does not notify for a manual analysis while scheduledRunsOnly is enabled', async () => {
  const result = await analyze({ triggerKind: 'manual' });
  expect(result.status).toBe('completed');
  expect(result.requests).toEqual([]);
}, 15000);

it('allows a manual analysis notification when scheduledRunsOnly is disabled', async () => {
  const result = await analyze({
    triggerKind: 'manual',
    settings: { 'notifications.scheduledRunsOnly': false },
  });
  expect(result.status).toBe('completed');
  expect(
    result.requests.map(({ body }) => ({ event: body.event, newGroups: body.data.newGroups })),
  ).toEqual([{ event: 'duplicates.new', newGroups: 1 }]);
}, 15000);

it('honors the onNewDuplicates preference without changing the analysis result', async () => {
  const result = await analyze({ settings: { 'notifications.onNewDuplicates': false } });
  expect(result.status).toBe('completed');
  expect(result.requests).toEqual([]);
}, 15000);

it('sends only when the number of newly created groups reaches minNewGroups', async () => {
  const result = await analyze({ settings: { 'notifications.minNewGroups': 2 } });
  expect(result.status).toBe('completed');
  expect(result.requests).toEqual([]);
}, 15000);

it('makes no outbound request when an analysis creates groups with NOTIFY_URL unset', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const result = await analyze({ configured: false });
    expect(result.result.groupsCreated).toBe(1);
    expect(result.status).toBe('completed');
    expect(result.requests).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
}, 15000);

it('keeps a successful analysis completed and unlocked throughout failed delivery retries', async () => {
  const result = await analyze({ responseStatus: 503 });
  expect(result.status).toBe('completed');
  expect(result.result.groupsCreated).toBe(1);
  expect(result.requests.map(({ status, leaseCount }) => ({ status, leaseCount }))).toEqual(
    Array.from({ length: 3 }, () => ({ status: 'completed', leaseCount: 0 })),
  );
}, 15000);

it('does not deliver completion notifications when cancellation wins before completion', async () => {
  const result = await analyze({ cancelBeforeCompletion: true });
  expect(result.status).toBe('cancelled');
  expect(result.requests).toEqual([]);
}, 15000);

it('includes analysis dependencies from scheduled work while scheduledRunsOnly is enabled', async () => {
  const result = await analyze({ triggerKind: 'dependency' });
  expect(result.status).toBe('completed');
  expect(
    result.requests.map(({ body }) => ({ event: body.event, newGroups: body.data.newGroups })),
  ).toEqual([{ event: 'duplicates.new', newGroups: 1 }]);
}, 15000);
