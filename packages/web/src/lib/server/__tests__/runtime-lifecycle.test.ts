import { describe, expect, it, vi } from 'vitest';

import { getProcessRuntimeState, registerRuntimeShutdownHandlers } from '../runtime-lifecycle.js';

describe('process runtime lifecycle', () => {
  it('reuses one symbol-backed state across module initialization', () => {
    const scope = {};

    const first = getProcessRuntimeState(scope);
    first.promise = Promise.resolve('runtime' as never);

    expect(getProcessRuntimeState(scope)).toBe(first);
    expect(getProcessRuntimeState(scope).promise).toBe(first.promise);
  });

  it('registers signal handlers once and closes admission before scheduler shutdown', () => {
    const state = getProcessRuntimeState({});
    const handlers = new Map<string, () => void>();
    const signalSource = {
      once: vi.fn((signal: string, handler: () => void) => {
        handlers.set(signal, handler);
      }),
    };
    const order: string[] = [];
    const runtime = {
      logger: { info: vi.fn() },
      acceptingGate: { stopAccepting: () => order.push('gate') },
    };
    state.scheduler = { stopAccepting: () => order.push('scheduler') };
    state.metrics = {
      shutdown: () => {
        order.push('metrics');
      },
    };

    registerRuntimeShutdownHandlers(state, runtime as never, signalSource as never);
    registerRuntimeShutdownHandlers(state, runtime as never, signalSource as never);
    handlers.get('SIGTERM')?.();

    expect(signalSource.once).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['gate', 'scheduler', 'metrics']);
  });
});
