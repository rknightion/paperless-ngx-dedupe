import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type * as SchedulerModule from '../scheduler.js';

const mocks = vi.hoisted(() => ({
  state: {} as { promise?: Promise<unknown> },
  register: vi.fn(),
  stats: vi.fn(),
  runtime: { db: {}, config: { PAPERLESS_METRICS_ENABLED: false } },
}));
vi.mock('$app/env', () => ({ building: true }));
vi.mock('@paperless-dedupe/core', () => ({
  createLogger: () => ({ info: vi.fn() }),
  initLogger: vi.fn(),
  parseConfig: () => ({ LOG_LEVEL: 'warn', DATABASE_URL: ':memory:' }),
  registerObservableGauges: mocks.register,
}));
vi.mock('@paperless-dedupe/core/telemetry/gauge-stats', () => ({ getGaugeStats: mocks.stats }));
vi.mock('$lib/server/db', () => ({ getDatabase: async () => ({ db: {}, sqlite: {} }) }));
vi.mock('$lib/server/job-dispatcher', () => ({ createJobDispatcher: vi.fn() }));
vi.mock('$lib/server/scheduler', async (original) => ({
  ...(await original<typeof SchedulerModule>()),
  createRuntime: () => mocks.runtime,
  createRuntimeAcceptingGate: vi.fn(),
  startScheduler: vi.fn(),
}));
vi.mock('$lib/server/runtime-lifecycle', () => ({
  getProcessRuntimeState: () => mocks.state,
  registerRuntimeShutdownHandlers: vi.fn(),
}));
import { initializeServerRuntime } from '../../../runtime.server';

beforeEach(() => {
  vi.clearAllMocks();
  delete mocks.state.promise;
  vi.stubEnv('OTEL_ENABLED', 'false');
  vi.stubEnv('OTEL_PROMETHEUS_ENABLED', 'false');
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it.each(['OTEL_ENABLED', 'OTEL_PROMETHEUS_ENABLED'])(
  'registers once for %s and queries at most once per 15 seconds',
  async (variable) => {
    vi.stubEnv(variable, 'true');
    const first = {
      documentsCount: 2,
      unresolvedDuplicatesCount: 1,
      activeJobsCount: 1,
      aiPendingCount: 1,
    };
    const next = { ...first, documentsCount: 3 };
    mocks.stats.mockReturnValueOnce(first).mockReturnValue(next);
    await initializeServerRuntime();
    await initializeServerRuntime();
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.stats).not.toHaveBeenCalled();
    const read = mocks.register.mock.calls[0][0] as () => typeof first;
    for (let i = 0; i < 4; i++) expect(read()).toEqual(first);
    vi.advanceTimersByTime(14_999);
    expect(read()).toEqual(first);
    expect(mocks.stats).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(read()).toEqual(next);
    expect(mocks.stats).toHaveBeenCalledTimes(2);
    expect(mocks.stats).toHaveBeenCalledWith(mocks.runtime.db);
  },
);

it('registers and queries nothing when telemetry is disabled', async () => {
  await initializeServerRuntime();
  expect(mocks.register).not.toHaveBeenCalled();
  expect(mocks.stats).not.toHaveBeenCalled();
});
