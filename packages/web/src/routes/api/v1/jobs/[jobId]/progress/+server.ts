import { getJob } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const jobId = params.jobId;
  const db = locals.db;

  const initialJob = getJob(db, jobId);
  if (!initialJob) {
    return new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: `Job '${jobId}' not found` } }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const terminalStates = ['completed', 'failed', 'cancelled'];

  // If job is already in a terminal state, send complete event and close
  if (terminalStates.includes(initialJob.status!)) {
    const body = [
      `event: complete`,
      `data: ${JSON.stringify({ progress: initialJob.progress, message: initialJob.progressMessage, status: initialJob.status })}`,
      '',
      '',
    ].join('\n');

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Create SSE stream
  const state = {
    intervalId: null as ReturnType<typeof setInterval> | null,
    keepaliveId: null as ReturnType<typeof setInterval> | null,
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function sendKeepalive() {
        controller.enqueue(encoder.encode(':keepalive\n\n'));
      }

      // Send initial progress
      sendEvent('progress', {
        progress: initialJob.progress,
        message: initialJob.progressMessage,
        status: initialJob.status,
      });

      // Poll every 500ms
      state.intervalId = setInterval(() => {
        try {
          const currentJob = getJob(db, jobId);

          if (!currentJob) {
            sendEvent('complete', { progress: 0, message: 'Job not found', status: 'failed' });
            cleanup();
            controller.close();
            return;
          }

          if (terminalStates.includes(currentJob.status!)) {
            sendEvent('complete', {
              progress: currentJob.progress,
              message: currentJob.progressMessage,
              status: currentJob.status,
            });
            cleanup();
            controller.close();
            return;
          }

          sendEvent('progress', {
            progress: currentJob.progress,
            message: currentJob.progressMessage,
            status: currentJob.status,
          });
        } catch {
          cleanup();
          controller.close();
        }
      }, 500);

      // Keepalive every 15s
      state.keepaliveId = setInterval(sendKeepalive, 15_000);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    if (state.keepaliveId) {
      clearInterval(state.keepaliveId);
      state.keepaliveId = null;
    }
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
