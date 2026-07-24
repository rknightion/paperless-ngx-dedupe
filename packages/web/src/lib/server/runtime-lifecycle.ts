import type { SchedulerController, ServerRuntime } from './scheduler.js';

const RUNTIME_STATE = Symbol.for('paperless-ngx-dedupe.server-runtime');

export interface ProcessRuntimeState {
  promise?: Promise<ServerRuntime>;
  scheduler?: SchedulerController;
  metrics?: { shutdown(): void | Promise<void> };
  signalHandlersRegistered?: boolean;
}

interface RuntimeScope {
  [RUNTIME_STATE]?: ProcessRuntimeState;
}

interface RuntimeSignalSource {
  once(signal: 'SIGTERM' | 'SIGINT', handler: () => void): unknown;
}

export function getProcessRuntimeState(scope: object = globalThis): ProcessRuntimeState {
  const runtimeScope = scope as RuntimeScope;
  return (runtimeScope[RUNTIME_STATE] ??= {});
}

export function registerRuntimeShutdownHandlers(
  state: ProcessRuntimeState,
  runtime: Pick<ServerRuntime, 'logger' | 'acceptingGate'>,
  signalSource: RuntimeSignalSource = process,
): void {
  if (state.signalHandlersRegistered) return;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signalSource.once(signal, () => {
      runtime.logger.info({ signal }, 'Stopping server runtime');
      runtime.acceptingGate.stopAccepting();
      state.scheduler?.stopAccepting();
      void state.metrics?.shutdown();
    });
  }
  state.signalHandlersRegistered = true;
}
