import type { PublicCustomFieldDiscoveryRun } from '@paperless-dedupe/core';

type Fetcher = typeof fetch;

interface DiscoveryStartResponse {
  data?: {
    jobId?: unknown;
    existingFieldsUnavailable?: unknown;
  };
}

interface JobResponse {
  data?: {
    status?: unknown;
  };
}

interface DiscoveryRunResponse {
  data?: {
    run?: unknown;
  };
}

export interface RunCustomFieldDiscoveryClientOptions {
  fetcher?: Fetcher;
  wait?: () => Promise<void>;
  onStatus?: (status: 'queued' | 'running' | 'completed') => void;
  onExistingFieldsUnavailable?: () => void;
  signal?: AbortSignal;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error('Custom-field discovery request failed');
  return (await response.json()) as T;
}

export async function loadLatestCustomFieldDiscovery(
  fetcher: Fetcher = fetch,
): Promise<PublicCustomFieldDiscoveryRun | null> {
  const response = await fetcher('/api/v1/ai/custom-fields/recommendations');
  const body = await readJson<DiscoveryRunResponse>(response);
  const run = body.data?.run;
  if (run === null || run === undefined) return null;
  if (typeof run !== 'object' || Array.isArray(run)) {
    throw new Error('Custom-field discovery response was invalid');
  }
  return run as PublicCustomFieldDiscoveryRun;
}

export async function runCustomFieldDiscovery(
  options: RunCustomFieldDiscoveryClientOptions = {},
): Promise<PublicCustomFieldDiscoveryRun> {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 750)));
  const startResponse = await fetcher('/api/v1/ai/custom-fields/recommendations', {
    method: 'POST',
    signal: options.signal,
  });
  const start = await readJson<DiscoveryStartResponse>(startResponse);
  const jobId = start.data?.jobId;
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(jobId)) {
    throw new Error('Custom-field discovery response was invalid');
  }
  if (start.data?.existingFieldsUnavailable === true) {
    options.onExistingFieldsUnavailable?.();
  }
  options.onStatus?.('queued');

  let lastStatus: string | null = null;
  for (;;) {
    const jobResponse = await fetcher(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      signal: options.signal,
    });
    const job = await readJson<JobResponse>(jobResponse);
    const status = job.data?.status;
    if (typeof status !== 'string') {
      throw new Error('Custom-field discovery response was invalid');
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error('Custom-field discovery failed');
    }
    if (status === 'completed') break;
    if (!['pending', 'running', 'paused'].includes(status)) {
      throw new Error('Custom-field discovery response was invalid');
    }
    if (status !== lastStatus) options.onStatus?.('running');
    lastStatus = status;
    await wait();
  }

  options.onStatus?.('completed');
  const run = await loadLatestCustomFieldDiscovery(fetcher);
  if (!run || run.status !== 'completed' || !run.result) {
    throw new Error('Custom-field discovery result is unavailable');
  }
  return run;
}
