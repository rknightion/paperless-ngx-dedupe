<script lang="ts">
  import { untrack, setContext } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { ProgressBar, ConfirmDialog } from '$lib/components';
  import AiToastContainer from '$lib/components/ai/AiToastContainer.svelte';
  import AiDocumentPickerModal from '$lib/components/ai/AiDocumentPickerModal.svelte';
  import { addToast, resetStore } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import {
    Brain,
    Play,
    Pause,
    RefreshCw,
    Loader2,
    FileText,
    AlertCircle,
    CircleDot,
    CircleCheck,
    CircleX,
    TriangleAlert,
    Undo2,
    X,
    Info,
    ChevronDown,
  } from 'lucide-svelte';

  let { data, children } = $props();

  const initialData = untrack(() => data);

  // ── SSE State ──
  let isProcessing = $state(false);
  let jobId = $state<string | null>(initialData.activeJob?.id ?? null);
  let jobProgress = $state(initialData.activeJob?.progress ?? 0);
  let jobPhaseProgress = $state<number | undefined>(undefined);
  let jobMessage = $state(initialData.activeJob?.progressMessage ?? '');
  let jobError = $state<string | null>(null);
  let sseConnection: { close: () => void } | null = null;
  let showResumeHint = $state(false);
  let lastInvalidateTime = 0;
  const INVALIDATE_INTERVAL_MS = 3000;

  // ── Process Scope Dropdown ──
  let showProcessMenu = $state(false);
  let showDocPicker = $state(false);
  let confirmReprocessAll = $state(false);

  // ── Derived ──
  const stats = $derived(data.stats);
  const isResumable = $derived(stats.unprocessed > 0 && stats.totalProcessed > 0);

  // Tab badge counts
  const queueCount = $derived(stats.unprocessed + stats.failed);
  const pendingReviewCount = $derived(stats.pendingReview);
  const historyCount = $derived(stats.applied + stats.rejected + stats.reverted);

  function isActive(path: string): boolean {
    return $page.url.pathname.startsWith(path);
  }

  function tabHref(path: string): string {
    const limit = $page.url.searchParams.get('limit');
    return limit ? `${path}?limit=${limit}` : path;
  }

  // ── SSE Connection ──
  function connectSSE(id: string) {
    sseConnection?.close();
    isProcessing = true;
    jobError = null;
    sseConnection = connectJobSSE(id, {
      onProgress: (d) => {
        jobProgress = d.progress;
        jobPhaseProgress = d.phaseProgress;
        jobMessage = d.message ?? '';

        const now = Date.now();
        if (now - lastInvalidateTime > INVALIDATE_INTERVAL_MS) {
          lastInvalidateTime = now;
          invalidateAll();
        }
      },
      onComplete: (d) => {
        isProcessing = false;
        jobId = null;
        jobPhaseProgress = undefined;
        sseConnection = null;

        const sseData = d as { status?: string; errorMessage?: string };
        if (sseData.status === 'failed') {
          jobProgress = 0;
          jobError = sseData.errorMessage ?? 'Processing failed';
          jobMessage = '';
        } else if (sseData.status === 'cancelled') {
          jobMessage = 'Processing paused';
          showResumeHint = true;
        } else {
          jobProgress = 1;
          jobMessage = 'Processing complete';
        }

        invalidateAll();
      },
      onError: () => {
        isProcessing = false;
        jobId = null;
        sseConnection = null;
        invalidateAll();
      },
    });
  }

  $effect(() => {
    if (jobId) connectSSE(jobId);
    return () => {
      sseConnection?.close();
    };
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      sseConnection?.close();
      resetStore();
    };
  });

  // ── Action Handlers ──

  async function startProcessing(reprocess = false) {
    isProcessing = true;
    jobProgress = 0;
    jobError = null;
    jobMessage = 'Starting...';
    showResumeHint = false;
    try {
      const res = await fetch('/api/v1/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        jobId = json.data.jobId;
        addToast('success', reprocess ? 'Re-processing started' : 'Processing started');
      } else {
        isProcessing = false;
        jobMessage = '';
        addToast('error', json.error?.message ?? 'Failed to start processing');
      }
    } catch {
      isProcessing = false;
      jobMessage = '';
      addToast('error', 'Failed to start processing');
    }
  }

  async function startProcessingWithScope(scope: Record<string, unknown>, label: string) {
    isProcessing = true;
    jobProgress = 0;
    jobError = null;
    jobMessage = 'Starting...';
    showResumeHint = false;
    showProcessMenu = false;
    try {
      const res = await fetch('/api/v1/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (res.ok && json.data?.jobId) {
        jobId = json.data.jobId;
        addToast('success', label);
      } else {
        isProcessing = false;
        jobMessage = '';
        addToast('error', json.error?.message ?? 'Failed to start processing');
      }
    } catch {
      isProcessing = false;
      jobMessage = '';
      addToast('error', 'Failed to start processing');
    }
  }

  function handleProcessNew() {
    showProcessMenu = false;
    startProcessing(false);
  }

  function handleRetryFailed() {
    showProcessMenu = false;
    startProcessingWithScope({ type: 'failed_only' }, 'Retrying failed documents');
  }

  function handleProcessSelected(documentIds: string[]) {
    showDocPicker = false;
    if (documentIds.length === 0) return;
    startProcessingWithScope(
      { type: 'selected_document_ids', documentIds },
      `Processing ${documentIds.length} selected document${documentIds.length === 1 ? '' : 's'}`,
    );
  }

  function handleReprocessAll() {
    confirmReprocessAll = false;
    showProcessMenu = false;
    startProcessing(true);
  }

  async function cancelCurrentJob() {
    if (!jobId) return;
    try {
      await fetch(`/api/v1/jobs/${jobId}/cancel`, { method: 'POST' });
      addToast('success', 'Processing cancelled');
    } catch {
      addToast('error', 'Failed to cancel job');
    }
  }

  // ── Context for child pages ──
  setContext('ai-layout', {
    get isProcessing() {
      return isProcessing;
    },
    get stats() {
      return stats;
    },
    startProcessing,
    startProcessingWithScope,
    cancelCurrentJob,
  });
</script>

<svelte:head>
  <title>AI Processing - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-1">
      <h1 class="text-ink flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
        <div class="bg-accent-light flex h-8 w-8 items-center justify-center rounded-lg">
          <Brain class="text-accent h-4.5 w-4.5" />
        </div>
        AI Processing
      </h1>
      <p class="text-muted text-sm">Extract and apply document metadata using AI.</p>
    </div>
    <div class="relative flex gap-2">
      <button
        onclick={handleProcessNew}
        disabled={isProcessing}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
      >
        {#if isProcessing}
          <Loader2 class="h-4 w-4 animate-spin" />
          Processing...
        {:else}
          <Play class="h-4 w-4" />
          {isResumable ? 'Resume' : 'Process New'}
        {/if}
      </button>
      <div class="relative">
        <button
          onclick={() => (showProcessMenu = !showProcessMenu)}
          disabled={isProcessing}
          class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <ChevronDown class="h-4 w-4" />
        </button>
        {#if showProcessMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="border-soft bg-surface absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border shadow-lg"
            onmouseleave={() => (showProcessMenu = false)}
          >
            <button
              onclick={handleProcessNew}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <Play class="h-4 w-4" /> Process New
            </button>
            {#if stats.failed > 0}
              <button
                onclick={handleRetryFailed}
                class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
              >
                <RefreshCw class="h-4 w-4" /> Retry Failed
              </button>
            {/if}
            <button
              onclick={() => {
                showProcessMenu = false;
                showDocPicker = true;
              }}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <FileText class="h-4 w-4" /> Process Selected...
            </button>
            <div class="border-soft border-t"></div>
            <button
              onclick={() => {
                showProcessMenu = false;
                confirmReprocessAll = true;
              }}
              class="text-ember hover:bg-ember-light flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <AlertCircle class="h-4 w-4" /> Re-run Entire Library
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Stats Cards -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    <a
      href="/ai-processing/history"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-accent-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <FileText class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Processed</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.totalProcessed.toLocaleString()}
        </p>
      </div>
    </a>
    <a
      href="/ai-processing/review"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-warn-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <CircleDot class="text-warn h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Pending</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.pendingReview.toLocaleString()}
        </p>
      </div>
    </a>
    <a
      href="/ai-processing/history?status=applied"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-success-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <CircleCheck class="text-success h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Applied</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.applied.toLocaleString()}
        </p>
      </div>
    </a>
    <a
      href="/ai-processing/history?status=rejected"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
        <CircleX class="text-muted h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Rejected</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.rejected.toLocaleString()}
        </p>
      </div>
    </a>
    <a
      href="/ai-processing/history?status=reverted"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-accent-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Undo2 class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Reverted</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.reverted.toLocaleString()}
        </p>
      </div>
    </a>
    <a
      href="/ai-processing/history?status=failed"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-ember-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <TriangleAlert class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Failed</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.failed.toLocaleString()}
        </p>
      </div>
    </a>
  </div>

  <!-- Progress Panel -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 text-sm font-medium">
          <Loader2 class="text-accent h-4 w-4 animate-spin" />
          <span class="text-ink">Processing documents...</span>
        </div>
        <button
          onclick={cancelCurrentJob}
          class="border-soft text-muted hover:text-ink hover:bg-canvas flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Pause class="h-4 w-4" />
          Pause
        </button>
      </div>
      <div class="mt-3">
        <ProgressBar progress={jobProgress} phaseProgress={jobPhaseProgress} message={jobMessage} />
      </div>
    </div>
  {/if}

  <!-- Error Banner -->
  {#if jobError}
    <div class="bg-ember-light border-ember/20 flex items-start gap-3 rounded-xl border p-4">
      <div class="bg-ember/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <AlertCircle class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing failed</p>
        <p class="text-ink-light mt-0.5 text-sm break-words">{jobError}</p>
      </div>
      <button
        onclick={() => (jobError = null)}
        class="text-muted hover:text-ink -mt-0.5 shrink-0 rounded-lg p-1 transition-colors"
        title="Dismiss"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/if}

  <!-- Resume Hint -->
  {#if showResumeHint}
    <div class="bg-accent-light border-accent/20 flex items-start gap-3 rounded-xl border p-4">
      <div class="bg-accent/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Info class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing paused</p>
        <p class="text-ink-light mt-0.5 text-sm">
          {stats.unprocessed.toLocaleString()} document{stats.unprocessed === 1 ? '' : 's'} remaining.
          Click "{isResumable ? 'Resume' : 'Process New'}" to continue from where you left off.
        </p>
      </div>
      <button
        onclick={() => (showResumeHint = false)}
        class="text-muted hover:text-ink -mt-0.5 shrink-0 rounded-lg p-1 transition-colors"
        title="Dismiss"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/if}

  <!-- Tab Bar -->
  <nav class="flex border-b border-zinc-200 dark:border-zinc-700">
    <a
      href={tabHref('/ai-processing/queue')}
      class="border-b-2 px-4 py-2 text-sm font-medium {isActive('/ai-processing/queue')
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}"
    >
      Queue
      {#if queueCount > 0}
        <span
          class="bg-accent-light text-accent ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
          >{queueCount}</span
        >
      {/if}
    </a>
    <a
      href={tabHref('/ai-processing/review')}
      class="border-b-2 px-4 py-2 text-sm font-medium {isActive('/ai-processing/review')
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}"
    >
      Review
      {#if pendingReviewCount > 0}
        <span class="bg-warn-light text-warn ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
          >{pendingReviewCount}</span
        >
      {/if}
    </a>
    <a
      href={tabHref('/ai-processing/history')}
      class="border-b-2 px-4 py-2 text-sm font-medium {isActive('/ai-processing/history')
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}"
    >
      History
      {#if historyCount > 0}
        <span
          class="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          >{historyCount}</span
        >
      {/if}
    </a>
  </nav>

  <!-- Child Page Content -->
  {@render children()}
</div>

<!-- Overlays -->
<AiToastContainer />
<AiDocumentPickerModal
  open={showDocPicker}
  onsubmit={handleProcessSelected}
  oncancel={() => (showDocPicker = false)}
/>
<ConfirmDialog
  open={confirmReprocessAll}
  title="Re-run Entire Library?"
  message="This will re-process all documents in your library. Existing AI results will be overwritten. This may take a significant amount of time and API usage."
  confirmLabel="Re-run All"
  variant="ember"
  onconfirm={handleReprocessAll}
  oncancel={() => (confirmReprocessAll = false)}
/>
