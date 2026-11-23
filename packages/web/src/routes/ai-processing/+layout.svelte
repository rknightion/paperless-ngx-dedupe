<script lang="ts">
  import { untrack, setContext } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Button, ProgressBar, ConfirmDialog, Tabs } from '$lib/components';
  import AiToastContainer from '$lib/components/ai/AiToastContainer.svelte';
  import AiDocumentPickerModal from '$lib/components/ai/AiDocumentPickerModal.svelte';
  import { addToast, resetStore } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import BrainIcon from 'phosphor-svelte/lib/BrainIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
  import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
  import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import RadioButtonIcon from 'phosphor-svelte/lib/RadioButtonIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';

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
  const queueCount = $derived(stats.unprocessed + stats.failed + stats.skipped);
  const pendingReviewCount = $derived(stats.pendingReview);
  const historyCount = $derived(stats.applied + stats.rejected + stats.reverted);

  function isActive(path: string): boolean {
    return page.url.pathname.startsWith(path);
  }

  function tabHref(path: string): string {
    const limit = page.url.searchParams.get('limit');
    return limit ? `${path}?limit=${limit}` : path;
  }

  // `value` is the path prefix the tab owns, which is also what isActive()
  // matches on. Custom Fields carries no limit param, so it links directly.
  const tabs = $derived([
    {
      value: '/ai-processing/queue',
      label: 'Queue',
      href: tabHref('/ai-processing/queue'),
      count: queueCount,
      countTone: 'accent' as const,
    },
    {
      value: '/ai-processing/review',
      label: 'Review',
      href: tabHref('/ai-processing/review'),
      count: pendingReviewCount,
      countTone: 'warn' as const,
    },
    {
      value: '/ai-processing/history',
      label: 'History',
      href: tabHref('/ai-processing/history'),
      count: historyCount,
      countTone: 'neutral' as const,
    },
    {
      value: '/ai-processing/custom-fields',
      label: 'Custom Fields',
      href: '/ai-processing/custom-fields',
    },
  ]);

  const activeTab = $derived(tabs.find((t) => isActive(t.value))?.value ?? '');

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
      if (res.ok && json.data?.nothingToDo) {
        isProcessing = false;
        jobMessage = '';
        addToast('info', 'Nothing to process');
      } else if (res.ok && json.data?.jobId) {
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
          <BrainIcon class="text-accent h-4.5 w-4.5" />
        </div>
        AI Processing
      </h1>
      <p class="text-muted text-sm">Extract and apply document metadata using AI.</p>
    </div>
    <div class="relative flex gap-2">
      <Button onclick={handleProcessNew} loading={isProcessing} icon={PlayIcon}>
        {isProcessing ? 'Processing...' : isResumable ? 'Resume' : 'Process New'}
      </Button>
      <div class="relative">
        <Button
          variant="outline"
          icon={CaretDownIcon}
          ariaLabel="Choose AI processing scope"
          onclick={() => (showProcessMenu = !showProcessMenu)}
          disabled={isProcessing}
        />
        {#if showProcessMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="border-soft bg-surface absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border shadow-lg"
            onmouseleave={() => (showProcessMenu = false)}
          >
            <!-- Menu items below stay inline: Button is a centred, rounded control and cannot
                 express a full-bleed, left-aligned row inside a popover menu. -->
            <button
              onclick={handleProcessNew}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <PlayIcon class="h-4 w-4" /> Process New
            </button>
            {#if stats.failed > 0}
              <button
                onclick={handleRetryFailed}
                class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
              >
                <ArrowsClockwiseIcon class="h-4 w-4" /> Retry Failed
              </button>
            {/if}
            <button
              onclick={() => {
                showProcessMenu = false;
                showDocPicker = true;
              }}
              class="hover:bg-canvas text-ink flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <FileTextIcon class="h-4 w-4" /> Process Selected...
            </button>
            <div class="border-soft border-t"></div>
            <button
              onclick={() => {
                showProcessMenu = false;
                confirmReprocessAll = true;
              }}
              class="text-ember hover:bg-ember-light flex w-full items-center gap-2 px-4 py-2.5 text-sm"
            >
              <WarningCircleIcon class="h-4 w-4" /> Re-run Entire Library
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Stats Cards -->
  <div
    class="grid grid-cols-2 gap-3 sm:grid-cols-3 {stats.skipped > 0
      ? 'lg:grid-cols-7'
      : 'lg:grid-cols-6'}"
  >
    <a
      href="/ai-processing/history"
      class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
      data-sveltekit-preload-data
    >
      <div class="bg-accent-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <FileTextIcon class="text-accent h-4 w-4" />
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
        <RadioButtonIcon class="text-warn h-4 w-4" />
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
        <CheckCircleIcon class="text-success h-4 w-4" />
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
      <div class="bg-canvas-deep flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <XCircleIcon class="text-muted h-4 w-4" />
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
        <ArrowUUpLeftIcon class="text-accent h-4 w-4" />
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
        <WarningIcon class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0">
        <p class="text-muted text-xs font-medium">Failed</p>
        <p class="text-ink text-lg font-semibold tabular-nums">
          {stats.failed.toLocaleString()}
        </p>
      </div>
    </a>
    {#if stats.skipped > 0}
      <a
        href="/ai-processing/queue"
        class="panel flex items-center gap-3 p-4 no-underline transition-shadow hover:ring-2 hover:ring-black/10"
        data-sveltekit-preload-data
      >
        <div class="bg-warn-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <WarningCircleIcon class="text-warn h-4 w-4" />
        </div>
        <div class="min-w-0">
          <p class="text-muted text-xs font-medium">Skipped</p>
          <p class="text-ink text-lg font-semibold tabular-nums">
            {stats.skipped.toLocaleString()}
          </p>
        </div>
      </a>
    {/if}
  </div>

  <!-- Progress Panel -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 text-sm font-medium">
          <CircleNotchIcon class="text-accent h-4 w-4 animate-spin" />
          <span class="text-ink">Processing documents...</span>
        </div>
        <Button variant="outline" size="sm" icon={PauseIcon} onclick={cancelCurrentJob}>
          Pause
        </Button>
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
        <WarningCircleIcon class="text-ember h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing failed</p>
        <p class="text-ink-light mt-0.5 text-sm break-words">{jobError}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={XIcon}
        ariaLabel="Dismiss"
        title="Dismiss"
        class="-mt-0.5 shrink-0"
        onclick={() => (jobError = null)}
      />
    </div>
  {/if}

  <!-- Resume Hint -->
  {#if showResumeHint}
    <div class="bg-accent-light border-accent/20 flex items-start gap-3 rounded-xl border p-4">
      <div class="bg-accent/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <InfoIcon class="text-accent h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-medium">Processing paused</p>
        <p class="text-ink-light mt-0.5 text-sm">
          {stats.unprocessed.toLocaleString()} document{stats.unprocessed === 1 ? '' : 's'} remaining.
          Click "{isResumable ? 'Resume' : 'Process New'}" to continue from where you left off.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={XIcon}
        ariaLabel="Dismiss"
        title="Dismiss"
        class="-mt-0.5 shrink-0"
        onclick={() => (showResumeHint = false)}
      />
    </div>
  {/if}

  <Tabs {tabs} active={activeTab} ariaLabel="AI processing sections" />

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
