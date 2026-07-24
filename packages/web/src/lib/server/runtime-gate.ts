export class RuntimeUnavailableError extends Error {
  constructor() {
    super('Server runtime is no longer accepting work');
    this.name = 'RuntimeUnavailableError';
  }
}

export interface RuntimeAcceptingGate {
  isAccepting(): boolean;
  assertAccepting(): void;
  run<T>(operation: () => T): T;
  stopAccepting(): void;
}

export function createRuntimeAcceptingGate(): RuntimeAcceptingGate {
  let accepting = true;

  return {
    isAccepting: () => accepting,
    assertAccepting() {
      if (!accepting) throw new RuntimeUnavailableError();
    },
    run<T>(operation: () => T): T {
      if (!accepting) throw new RuntimeUnavailableError();
      return operation();
    },
    stopAccepting() {
      accepting = false;
    },
  };
}
