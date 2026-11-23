<script lang="ts">
  import { untrack, setContext } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Button, ProgressBar, ConfirmDialog, Tabs } from '$lib/components';
  import AiToastContainer from '$lib/components/ai/AiToastContainer.svelte';
  import AiDocumentPickerModal from '$lib/components/ai/AiDocumentPickerModal.svelte';
  import { addToast, resetStore } from '$lib/components/ai/AiReviewStore.svelte';
  import { connectJobSSE } from '$lib/sse';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
  import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
  import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';

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

  const appliedShare = $derived(
    stats.totalProcessed > 0
      ? `${((stats.applied / stats.totalProcessed) * 100).toFixed(1)}% of processed`
      : 'nothing processed yet',
  );

  // Four cells maximum. Rejected and reverted are actioned on the History tab.
  const stripCells = $derived([
    {
      href: '/ai-processing/history',
      label: 'Processed',
      value: stats.totalProcessed.toLocaleString(),
      note: `${stats.unprocessed.toLocaleString()} not yet processed`,
    },
    {
      href: '/ai-processing/review',
      label: 'Pending review',
      value: stats.pendingReview.toLocaleString(),
      note: 'waiting for review',
    },
    {
      href: '/ai-processing/history?status=applied',
      label: 'Applied',
      value: stats.applied.toLocaleString(),
      note: appliedShare,
    },
    {
      href: '/ai-processing/history?status=failed',
      label: 'Failed',
      value: stats.failed.toLocaleString(),
      note: stats.skipped > 0 ? `${stats.skipped.toLocaleString()} skipped` : 'extraction failures',
    },
  ]);

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
      label: 'Custom fields',
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

<div class="space-y-4">
  <!-- Header -->
  <header class="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
    <h1 class="text-ink text-xl font-semibold">AI processing</h1>
    <span class="text-muted font-mono text-xs">{page.url.pathname}</span>
    <div class="relative ml-auto flex items-center gap-2">
      <Button onclick={handleProcessNew} loading={isProcessing} icon={PlayIcon}>
        {isProcessing ? 'Processing...' : isResumable ? 'Resume' : 'Process new'}
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
            class="border-border-hover bg-surface-raised absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
            onmouseleave={() => (showProcessMenu = false)}
          >
            <!-- Menu items below stay inline: Button is a centred control and cannot
                 express a full-bleed, left-aligned row inside a popover menu. -->
            <button
              onclick={handleProcessNew}
              class="hover:bg-canvas-deep text-ink flex w-full items-center gap-2 px-4 py-2 text-sm"
            >
              <PlayIcon class="h-3.5 w-3.5" /> Process new
            </button>
            {#if stats.failed > 0}
              <button
                onclick={handleRetryFailed}
                class="hover:bg-canvas-deep text-ink flex w-full items-center gap-2 px-4 py-2 text-sm"
              >
                <ArrowsClockwiseIcon class="h-3.5 w-3.5" /> Retry failed
              </button>
            {/if}
            <button
              onclick={() => {
                showProcessMenu = false;
                showDocPicker = true;
              }}
              class="hover:bg-canvas-deep text-ink flex w-full items-center gap-2 px-4 py-2 text-sm"
            >
              <FileTextIcon class="h-3.5 w-3.5" /> Process selected...
            </button>
            <div class="border-border border-t"></div>
            <button
              onclick={() => {
                showProcessMenu = false;
                confirmReprocessAll = true;
              }}
              class="text-ember hover:bg-ember-light flex w-full items-center gap-2 px-4 py-2 text-sm"
            >
              <WarningCircleIcon class="h-3.5 w-3.5" /> Re-run entire library
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Stat strip: four divided cells. Rejected and reverted live on the History tab. -->
  <div class="bg-border border-border grid grid-cols-2 gap-px border lg:grid-cols-4">
    {#each stripCells as cell (cell.href)}
      <a
        href={cell.href}
        class="bg-surface hover:bg-canvas-deep block px-6 py-3 no-underline transition-colors"
        data-sveltekit-preload-data
      >
        <span class="label-micro block">{cell.label}</span>
        <span class="text-ink block text-2xl font-semibold tabular-nums">{cell.value}</span>
        <span class="text-muted block font-mono text-xs">{cell.note}</span>
      </a>
    {/each}
  </div>

  <!-- Progress Panel -->
  {#if isProcessing}
    <div class="panel">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium">
          <CircleNotchIcon class="text-accent h-3.5 w-3.5 animate-spin" />
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
    <div class="border-ember bg-ember-light flex items-start gap-3 border p-3">
      <span class="status-word text-ember mt-0.5"><span aria-hidden="true">●</span> FAIL</span>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-semibold">Processing failed</p>
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
    <div class="border-border bg-surface flex items-start gap-3 border p-3">
      <span class="status-word text-warn mt-0.5"><span aria-hidden="true">◆</span> PAUSED</span>
      <div class="min-w-0 flex-1">
        <p class="text-ink text-sm font-semibold">Processing paused</p>
        <p class="text-ink-light mt-0.5 text-sm">
          {stats.unprocessed.toLocaleString()} document{stats.unprocessed === 1 ? '' : 's'} remaining.
          Click "{isResumable ? 'Resume' : 'Process new'}" to continue from where you left off.
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
  title="Re-run entire library?"
  message="This will re-process all documents in your library. Existing AI results will be overwritten. This may take a significant amount of time and API usage."
  confirmLabel="Re-run all"
  variant="ember"
  onconfirm={handleReprocessAll}
  oncancel={() => (confirmReprocessAll = false)}
/>
