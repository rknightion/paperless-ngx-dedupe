import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseWithHandle, migrateDatabase } from '@paperless-dedupe/core';

import {
  createRuntime,
  initializeRuntimeOnce,
  RuntimeUnavailableError,
  startScheduler,
} from '../scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('server scheduler lifecycle', () => {
  it('shares one cold-start promise across repeated module initialization', async () => {
    const state: { promise?: Promise<string> } = {};
    const initialize = vi.fn().mockResolvedValue('runtime');

    const first = initializeRuntimeOnce(state, initialize);
    const second = initializeRuntimeOnce(state, initialize);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    await expect(first).resolves.toBe('runtime');
  });

  it('retries initialization after a rejected cold-start promise', async () => {
    const state: { promise?: Promise<string> } = {};
    const initialize = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('cold-start failed'))
      .mockResolvedValueOnce('runtime');

    await expect(initializeRuntimeOnce(state, initialize)).rejects.toThrow('cold-start failed');
    await expect(initializeRuntimeOnce(state, initialize)).resolves.toBe('runtime');
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('evaluates immediately at startup without waiting for a request', async () => {
    vi.useFakeTimers();
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const runtime = createRuntime({
      config: { DATABASE_URL: '/data/app.db' } as never,
      db: {} as never,
      sqlite: {} as never,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      dispatcher: { sqlite: {} as never, launchIntent: vi.fn() },
      evaluate,
    });

    const scheduler = startScheduler(runtime, 30_000);
    await vi.runAllTicks();

    expect(evaluate).toHaveBeenCalledTimes(1);
    scheduler.stopAccepting();
  });

  it('is idempotent for repeated initialization of the same runtime', async () => {
    vi.useFakeTimers();
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const runtime = createRuntime({
      config: { DATABASE_URL: '/data/app.db' } as never,
      db: {} as never,
      sqlite: {} as never,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      dispatcher: { sqlite: {} as never, launchIntent: vi.fn() },
      evaluate,
    });

    const first = startScheduler(runtime, 30_000);
    const second = startScheduler(runtime, 30_000);
    await vi.runAllTicks();

    expect(second).toBe(first);
    expect(evaluate).toHaveBeenCalledTimes(1);
    first.stopAccepting();
  });

  it('shutdown prevents future evaluation without cancelling active work', async () => {
    vi.useFakeTimers();
    let finishActive!: () => void;
    const active = new Promise<void>((resolve) => {
      finishActive = resolve;
    });
    const evaluate = vi.fn(() => active);
    const runtime = createRuntime({
      config: { DATABASE_URL: '/data/app.db' } as never,
      db: {} as never,
      sqlite: {} as never,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      dispatcher: { sqlite: {} as never, launchIntent: vi.fn() },
      evaluate,
    });

    const scheduler = startScheduler(runtime, 1_000);
    await vi.runAllTicks();
    scheduler.stopAccepting();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(evaluate).toHaveBeenCalledTimes(1);
    finishActive();
    await active;
  });

  it('rejects a manual operation after shutdown without persisting an intent', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const runtime = createRuntime({
      config: { DATABASE_URL: ':memory:' } as never,
      db,
      sqlite,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      dispatcher: { sqlite, launchIntent: vi.fn() },
      evaluate: vi.fn().mockResolvedValue(undefined),
    });
    const scheduler = startScheduler(runtime, 30_000);
    scheduler.stopAccepting();

    expect(() =>
      runtime.enqueueManual('sync', 'sync', {
        force: false,
        purge: false,
      }),
    ).toThrow(RuntimeUnavailableError);
    expect(sqlite.prepare('SELECT count(*) AS count FROM dispatch_intent').get()).toEqual({
      count: 0,
    });
  });

  it('leaves an accepted intent pending when shutdown wins before dispatch', async () => {
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    await migrateDatabase(sqlite);
    const runtime = createRuntime({
      config: { DATABASE_URL: ':memory:' } as never,
      db,
      sqlite,
      logger: { info: vi.fn(), error: vi.fn() } as never,
      dispatcher: { sqlite, launchIntent: vi.fn() },
      evaluate: vi.fn().mockResolvedValue(undefined),
    });
    const intent = runtime.enqueueManual('sync', 'sync', { force: true });
    const scheduler = startScheduler(runtime, 30_000);

    scheduler.stopAccepting();

    await expect(runtime.dispatchPending()).rejects.toThrow(RuntimeUnavailableError);
    expect(
      sqlite.prepare('SELECT status FROM dispatch_intent WHERE id = ?').get(intent.id),
    ).toEqual({ status: 'pending' });
  });
});
