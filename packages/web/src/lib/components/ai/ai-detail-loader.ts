export type AiDetailLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface AiDetailSnapshot<T> {
  id: string | null;
  detail: T | null;
  state: AiDetailLoadState;
}

export function createAiDetailLoader<T>(
  fetchDetail: (id: string) => Promise<T>,
  onChange: (snapshot: AiDetailSnapshot<T>) => void,
) {
  let generation = 0;
  let activeId: string | null = null;

  async function load(id: string): Promise<void> {
    const requestGeneration = ++generation;
    activeId = id;
    onChange({ id, detail: null, state: 'loading' });
    try {
      const detail = await fetchDetail(id);
      if (generation === requestGeneration && activeId === id) {
        onChange({ id, detail, state: 'loaded' });
      }
    } catch {
      if (generation === requestGeneration && activeId === id) {
        onChange({ id, detail: null, state: 'error' });
      }
    }
  }

  function close(): void {
    generation += 1;
    activeId = null;
    onChange({ id: null, detail: null, state: 'idle' });
  }

  function reload(): Promise<void> {
    return activeId ? load(activeId) : Promise.resolve();
  }

  return { load, close, reload };
}
