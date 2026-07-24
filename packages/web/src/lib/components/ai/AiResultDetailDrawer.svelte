<script lang="ts">
  import { X, ExternalLink, Loader2, AlertCircle, RefreshCw, Check } from 'lucide-svelte';
  import {
    fieldSelections,
    initializeFieldSelection,
    setFieldSelection,
  } from './AiReviewStore.svelte';
  import { createAiDetailLoader } from './ai-detail-loader';
  import AiFieldSelection from './AiFieldSelection.svelte';
  import AiApplyAuditCard from './AiApplyAuditCard.svelte';
  import AiDocumentPreview from './AiDocumentPreview.svelte';
  import type {
    AiFieldSelection as AiFieldSelectionValue,
    AiInboxResultDetail,
  } from '@paperless-dedupe/core';

  interface Props {
    resultId: string;
    mobile?: boolean;
    paperlessUrl?: string;
    extractEnabled?: {
      title: boolean;
      correspondent: boolean;
      documentType: boolean;
      tags: boolean;
      customFields: boolean;
      processedTag?: boolean;
    };
    onapply: (
      id: string,
      selection: AiFieldSelectionValue,
      options: { allowClearing: boolean; createMissingEntities: boolean },
    ) => Promise<void>;
    onreject: (id: string) => Promise<void>;
    onreprocess: (id: string) => Promise<void>;
    onrevert?: (id: string, selection: AiFieldSelectionValue) => Promise<void>;
    onclose: () => void;
  }

  let {
    resultId,
    mobile = false,
    paperlessUrl = '',
    extractEnabled = {
      title: true,
      correspondent: true,
      documentType: true,
      tags: true,
      customFields: true,
    },
    onapply,
    onreject,
    onreprocess,
    onrevert,
    onclose,
  }: Props = $props();

  let isApplying = $state(false);
  let isRejecting = $state(false);
  let isRetrying = $state(false);
  let isReprocessing = $state(false);

  const activeId = $derived(resultId);
  let detail = $state<AiInboxResultDetail | null>(null);
  let loadState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const selection = $derived(activeId ? (fieldSelections.get(activeId) ?? null) : null);

  const detailLoader = createAiDetailLoader<AiInboxResultDetail>(
    async (id) => {
      const response = await fetch(`/api/v1/ai/results/${id}?mode=inbox`);
      if (!response.ok) throw new Error('Failed to load result');
      const body = await response.json();
      return body.data;
    },
    (snapshot) => {
      detail = snapshot.detail;
      loadState = snapshot.state;
      if (snapshot.id && snapshot.detail) {
        initializeFieldSelection(snapshot.id, snapshot.detail, extractEnabled);
      }
    },
  );

  $effect(() => {
    const id = activeId;
    if (id) void detailLoader.load(id);
    else detailLoader.close();
    return () => detailLoader.close();
  });

  const checkedCount = $derived(
    selection
      ? Number(selection.title) +
          Number(selection.correspondent) +
          Number(selection.documentType) +
          Number(selection.tags) +
          Number(selection.processedTag) +
          selection.customFieldIds.length
      : 0,
  );

  const isExtractionFailure = $derived(() => {
    if (!detail || detail.appliedStatus !== 'failed') return false;
    return (
      !detail.suggestedTitle &&
      !detail.suggestedCorrespondent &&
      !detail.suggestedDocumentType &&
      detail.suggestedTags.length === 0 &&
      detail.suggestedCustomFields.length === 0
    );
  });
  const isReviewable = $derived(
    detail?.appliedStatus === 'pending_review' ||
      (detail?.appliedStatus === 'failed' && detail.failureType === 'review_conflict'),
  );

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'pending_review':
        return 'bg-warn-light text-warn';
      case 'applied':
        return 'bg-success-light text-success';
      case 'partial':
        return 'bg-accent-light text-accent';
      case 'rejected':
        return 'text-muted bg-canvas';
      case 'failed':
        return 'bg-ember-light text-ember';
      case 'skipped':
        return 'bg-warn-light text-warn';
      default:
        return 'bg-canvas text-muted';
    }
  }

  function statusDisplayText(status: string): string {
    switch (status) {
      case 'pending_review':
        return 'Pending Review';
      case 'failed':
        return 'Failed';
      case 'skipped':
        return 'Skipped';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  async function handleApply(): Promise<void> {
    if (!activeId || !selection || checkedCount === 0) return;
    isApplying = true;
    try {
      await onapply(activeId, selection, {
        allowClearing: false,
        createMissingEntities: true,
      });
    } finally {
      isApplying = false;
    }
  }

  async function handleReject(): Promise<void> {
    if (!activeId) return;
    isRejecting = true;
    try {
      await onreject(activeId);
    } finally {
      isRejecting = false;
    }
  }

  async function handleRetry(): Promise<void> {
    if (!activeId || !selection) return;
    isRetrying = true;
    try {
      await onapply(activeId, selection, {
        allowClearing: false,
        createMissingEntities: true,
      });
    } finally {
      isRetrying = false;
    }
  }

  async function handleRevert(): Promise<void> {
    if (!activeId || !selection || !onrevert) return;
    isApplying = true;
    try {
      await onrevert(activeId, selection);
    } finally {
      isApplying = false;
    }
  }

  async function handleReprocess(): Promise<void> {
    if (!activeId) return;
    isReprocessing = true;
    try {
      await onreprocess(activeId);
    } finally {
      isReprocessing = false;
    }
  }

  function formatDuration(ms: number | null): string {
    if (ms === null) return '--';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  }
</script>

{#if activeId}
  {#if mobile}
    <!-- Mobile drawer -->
    <div class="fixed inset-0 z-40">
      <button
        type="button"
        class="absolute inset-0 bg-black/40"
        aria-label="Close drawer"
        onclick={onclose}
      ></button>
      <div
        class="bg-surface absolute inset-x-0 bottom-0 h-[85dvh] overflow-y-auto rounded-t-2xl shadow-xl"
      >
        <!-- Drag handle -->
        <div class="bg-surface sticky top-0 z-10 flex justify-center pt-3 pb-2">
          <div class="bg-soft h-1 w-10 rounded-full"></div>
        </div>
        {@render drawerContent()}
      </div>
    </div>
  {:else}
    <!-- Desktop aside -->
    <aside class="panel sticky top-24 max-h-[calc(100vh-12rem)] w-[480px] shrink-0 overflow-y-auto">
      {@render drawerContent()}
    </aside>
  {/if}
{/if}

{#snippet drawerContent()}
  {#if loadState === 'loading'}
    <!-- Loading skeleton -->
    <div class="space-y-4 p-4">
      <div class="flex items-center justify-between">
        <div class="bg-canvas-deep h-6 w-48 animate-pulse rounded"></div>
        <button
          onclick={onclose}
          class="text-muted hover:text-ink rounded-lg p-1.5 transition-colors"
          title="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="bg-canvas-deep h-[400px] animate-pulse rounded-lg"></div>
      <div class="space-y-3">
        <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
        <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
        <div class="bg-canvas-deep h-20 animate-pulse rounded-lg"></div>
      </div>
    </div>
  {:else if loadState === 'error'}
    <!-- Error state -->
    <div class="flex flex-col items-center justify-center gap-4 p-8">
      <div class="bg-ember-light flex h-12 w-12 items-center justify-center rounded-full">
        <AlertCircle class="text-ember h-6 w-6" />
      </div>
      <p class="text-ink text-sm font-medium">Failed to load result</p>
      <button
        onclick={() => detailLoader.reload()}
        class="border-soft text-ink hover:bg-canvas flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
      >
        <RefreshCw class="h-4 w-4" />
        Retry
      </button>
    </div>
  {:else if detail}
    <!-- Loaded content -->
    <div class="space-y-5 p-4">
      <!-- Header -->
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1 space-y-1.5">
          <h2 class="text-ink text-lg leading-tight font-semibold break-words">
            {detail.documentTitle}
          </h2>
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
                detail.appliedStatus,
              )}"
            >
              {statusDisplayText(detail.appliedStatus)}
            </span>
            <a
              href="{paperlessUrl}/documents/{detail.paperlessId}/details"
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:text-accent-hover flex items-center gap-1 text-xs font-medium"
            >
              View in Paperless
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        </div>
        <button
          onclick={onclose}
          class="text-muted hover:text-ink shrink-0 rounded-lg p-1.5 transition-colors"
          title="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      {#if detail.truncation?.truncated}
        <p class="bg-warn-light/30 text-muted rounded-lg px-3 py-2 text-xs" role="status">
          Some values were shortened for safe review.
        </p>
      {/if}

      <!-- Skipped Banner -->
      {#if detail.appliedStatus === 'skipped' && detail.errorMessage}
        <div class="bg-warn-light/30 border-warn/20 space-y-2 rounded-lg border p-4">
          <div class="flex items-start gap-2">
            <AlertCircle class="text-warn mt-0.5 h-4 w-4 shrink-0" />
            <div class="min-w-0 space-y-1">
              <p class="text-warn text-sm font-semibold">No OCR Text</p>
              <p class="text-muted text-xs">
                This document has no text content. Run OCR in Paperless-NGX, then re-sync and retry.
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Error Banner -->
      {#if detail.appliedStatus === 'failed'}
        <div class="bg-ember-light/30 border-ember/20 space-y-2 rounded-lg border p-4">
          <div class="flex items-start gap-2">
            <AlertCircle class="text-ember mt-0.5 h-4 w-4 shrink-0" />
            <div class="min-w-0 space-y-1">
              <p class="text-ember text-sm font-semibold">
                {isExtractionFailure() ? 'Extraction Failed' : 'Apply Failed'}
              </p>
              <p class="text-muted text-xs">
                {isExtractionFailure()
                  ? 'The extraction did not complete. Retry when the underlying issue is resolved.'
                  : 'The reviewed apply conflicted with newer document data. Review the current values again.'}
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Document Preview -->
      <AiDocumentPreview paperlessId={detail.paperlessId} mode="preview" />

      <!-- Suggestions -->
      {#if selection}
        <AiFieldSelection
          result={detail}
          {selection}
          {extractEnabled}
          disabled={!isReviewable}
          onchange={(next) => activeId && setFieldSelection(activeId, next)}
        />
      {/if}

      <!-- Evidence -->
      {#if detail.evidence}
        <div class="space-y-2">
          <h3 class="text-ink text-sm font-semibold">Evidence</h3>
          <blockquote class="border-accent text-muted border-l-2 pl-3 text-sm italic">
            {detail.evidence.length > 500 ? `${detail.evidence.slice(0, 497)}...` : detail.evidence}
          </blockquote>
        </div>
      {/if}

      {#if detail.appliedStatus === 'applied' || detail.appliedStatus === 'partial' || detail.appliedStatus === 'reverted'}
        <AiApplyAuditCard result={detail} />
      {/if}

      <!-- Processing Info -->
      <div class="space-y-2">
        <h3 class="text-ink text-sm font-semibold">Processing Info</h3>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">Provider</dt>
          <dd class="text-ink font-medium">{detail.provider}</dd>
          <dt class="text-muted">Model</dt>
          <dd class="text-ink font-medium">{detail.model}</dd>
          <dt class="text-muted">Prompt Tokens</dt>
          <dd class="text-ink font-medium tabular-nums">
            {detail.promptTokens?.toLocaleString() ?? '--'}
          </dd>
          <dt class="text-muted">Completion Tokens</dt>
          <dd class="text-ink font-medium tabular-nums">
            {detail.completionTokens?.toLocaleString() ?? '--'}
          </dd>
          <dt class="text-muted">Processing Time</dt>
          <dd class="text-ink font-medium tabular-nums">
            {formatDuration(detail.processingTimeMs)}
          </dd>
          <dt class="text-muted">Created At</dt>
          <dd class="text-ink font-medium">{formatDate(detail.createdAt)}</dd>
        </dl>
      </div>
    </div>

    <!-- Action Footer -->
    {#if isReviewable}
      <div class="border-soft bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
        <button
          onclick={handleApply}
          disabled={isApplying || checkedCount === 0}
          class="bg-accent hover:bg-accent-hover flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
        >
          {#if isApplying}
            <Loader2 class="h-4 w-4 animate-spin" />
            Applying...
          {:else}
            <Check class="h-4 w-4" />
            Apply {checkedCount} field{checkedCount !== 1 ? 's' : ''}
          {/if}
        </button>
        <button
          onclick={handleReject}
          disabled={isRejecting}
          class="border-ember text-ember hover:bg-ember-light flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {#if isRejecting}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <X class="h-4 w-4" />
            Reject
          {/if}
        </button>
      </div>
    {/if}

    {#if (detail.appliedStatus === 'applied' || detail.appliedStatus === 'partial') && onrevert}
      <div class="border-soft bg-surface sticky bottom-0 flex border-t px-4 py-3">
        <button
          onclick={handleRevert}
          disabled={isApplying || checkedCount === 0}
          class="border-ember text-ember hover:bg-ember-light flex flex-1 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Revert selected audited fields
        </button>
      </div>
    {/if}

    {#if detail.appliedStatus === 'failed' && detail.failureType !== 'review_conflict'}
      <div class="border-soft bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
        {#if isExtractionFailure()}
          <button
            onclick={handleReprocess}
            disabled={isReprocessing}
            class="bg-accent hover:bg-accent-hover flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {#if isReprocessing}
              <Loader2 class="h-4 w-4 animate-spin" />
              Retrying Extraction...
            {:else}
              <RefreshCw class="h-4 w-4" />
              Retry Extraction
            {/if}
          </button>
        {:else}
          <button
            onclick={handleRetry}
            disabled={isRetrying}
            class="bg-accent hover:bg-accent-hover flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {#if isRetrying}
              <Loader2 class="h-4 w-4 animate-spin" />
              Retrying...
            {:else}
              <RefreshCw class="h-4 w-4" />
              Retry Apply
            {/if}
          </button>
        {/if}
      </div>
    {/if}
  {/if}
{/snippet}
