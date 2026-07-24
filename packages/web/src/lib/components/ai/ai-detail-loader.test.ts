import { describe, expect, it, vi } from 'vitest';
import { createAiDetailLoader } from './ai-detail-loader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('AI detail loader', () => {
  it('ignores an older result that resolves after a newer selection', async () => {
    const first = deferred<{ id: string }>();
    const second = deferred<{ id: string }>();
    const fetchDetail = vi.fn((id: string) => (id === 'first' ? first.promise : second.promise));
    const states: Array<{ id: string | null; detail: { id: string } | null; state: string }> = [];
    const loader = createAiDetailLoader<{ id: string }>(fetchDetail, (snapshot) =>
      states.push(snapshot),
    );

    const firstLoad = loader.load('first');
    const secondLoad = loader.load('second');
    second.resolve({ id: 'second' });
    await secondLoad;
    first.resolve({ id: 'first' });
    await firstLoad;

    expect(states.at(-1)).toEqual({
      id: 'second',
      detail: { id: 'second' },
      state: 'loaded',
    });
  });

  it('invalidates an in-flight request when the drawer closes', async () => {
    const pending = deferred<{ id: string }>();
    const states: Array<{ id: string | null; detail: { id: string } | null; state: string }> = [];
    const loader = createAiDetailLoader(
      () => pending.promise,
      (snapshot) => states.push(snapshot),
    );

    const load = loader.load('result');
    loader.close();
    pending.resolve({ id: 'result' });
    await load;

    expect(states.at(-1)).toEqual({ id: null, detail: null, state: 'idle' });
  });

  it('ignores the old response after closing and reopening the same result', async () => {
    const oldRequest = deferred<{ version: string }>();
    const newRequest = deferred<{ version: string }>();
    const fetchDetail = vi
      .fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const states: Array<{
      id: string | null;
      detail: { version: string } | null;
      state: string;
    }> = [];
    const loader = createAiDetailLoader<{ version: string }>(fetchDetail, (snapshot) =>
      states.push(snapshot),
    );

    const oldLoad = loader.load('same');
    loader.close();
    const newLoad = loader.load('same');
    oldRequest.resolve({ version: 'old' });
    await oldLoad;
    newRequest.resolve({ version: 'new' });
    await newLoad;

    expect(states.at(-1)).toEqual({
      id: 'same',
      detail: { version: 'new' },
      state: 'loaded',
    });
  });
});
