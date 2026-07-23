import { browser } from '$app/environment';

export interface SSECallbacks {
  onProgress?: (data: {
    progress: number;
    phaseProgress?: number;
    message?: string;
    status?: string;
  }) => void;
  onComplete?: (data: {
    status: string;
    progress?: number;
    phaseProgress?: number;
    message?: string;
    result?: unknown;
  }) => void;
  onError?: (error: Event) => void;
  onDiagnostic?: (diagnostic: {
    code: 'malformed_event';
    message: 'Received an invalid activity update.';
  }) => void;
}

export function connectJobSSE(jobId: string, callbacks: SSECallbacks): { close: () => void } {
  if (!browser) {
    return { close: () => {} };
  }

  const source = new EventSource(`/api/v1/jobs/${jobId}/progress`);

  source.addEventListener('progress', (event) => {
    try {
      const data = JSON.parse(event.data);
      callbacks.onProgress?.(data);
    } catch {
      callbacks.onDiagnostic?.({
        code: 'malformed_event',
        message: 'Received an invalid activity update.',
      });
    }
  });

  source.addEventListener('complete', (event) => {
    try {
      const data = JSON.parse(event.data);
      callbacks.onComplete?.(data);
    } catch {
      callbacks.onDiagnostic?.({
        code: 'malformed_event',
        message: 'Received an invalid activity update.',
      });
    }
    source.close();
  });

  source.onerror = (event) => {
    callbacks.onError?.(event);
    source.close();
  };

  return {
    close: () => source.close(),
  };
}
