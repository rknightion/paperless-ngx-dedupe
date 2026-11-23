<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import {
    fieldSelections,
    initializeFieldSelection,
    setFieldSelection,
  } from './AiReviewStore.svelte';
  import { createAiDetailLoader } from './ai-detail-loader';
  import AiFieldSelection from './AiFieldSelection.svelte';
  import AiApplyAuditCard from './AiApplyAuditCard.svelte';
  import AiDocumentPreview from './AiDocumentPreview.svelte';
  import { aiStatusWord } from './ai-status';
  import type {
    AiFieldSelection as AiFieldSelectionValue,
    AiInboxResultDetail,
  } from '@paperless-dedupe/core';

  const readOnly = $derived(page.data.readOnly === true);

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
  let detail = $state<(AiInboxResultDetail & { previewUrl?: string }) | null>(null);
  let loadState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const selection = $derived(activeId ? (fieldSelections.get(activeId) ?? null) : null);

  const detailLoader = createAiDetailLoader<AiInboxResultDetail>(
    async (id) => {
      const response = await fetch(`/api/v1/ai/results/${id}?mode=inbox&includeMedia=true`);
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

  const statusWord = $derived(detail ? aiStatusWord(detail.appliedStatus) : null);

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
      <!-- Stays inline: a full-screen backdrop hit target, not a Button-shaped control. -->
      <button
        type="button"
        class="bg-ink/50 absolute inset-0"
        aria-label="Close drawer"
        onclick={onclose}
      ></button>
      <div
        class="bg-surface-raised absolute inset-x-0 bottom-0 h-[85dvh] overflow-y-auto rounded-t-md shadow-lg"
      >
        <!-- Drag handle -->
        <div class="bg-surface-raised sticky top-0 z-10 flex justify-center pt-3 pb-2">
          <div class="bg-border-hover h-1 w-10"></div>
        </div>
        {@render drawerContent()}
      </div>
    </div>
  {:else}
    <!-- Desktop aside -->
    <aside
      class="border-border bg-canvas sticky top-4 max-h-[calc(100vh-8rem)] w-[380px] shrink-0 overflow-y-auto border-l"
    >
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
        <Button
          variant="ghost"
          size="sm"
          icon={XIcon}
          ariaLabel="Close"
          title="Close"
          onclick={onclose}
        />
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
    <div class="flex flex-col items-center justify-center gap-3 p-8">
      <span class="status-word text-ember"><span aria-hidden="true">●</span> FAIL</span>
      <p class="text-ink text-sm font-semibold">Failed to load result</p>
      <Button variant="outline" icon={ArrowsClockwiseIcon} onclick={() => detailLoader.reload()}>
        Retry
      </Button>
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
            {#if statusWord}
              <span class="status-word {statusWord.colorClass}">
                <span aria-hidden="true">{statusWord.shape}</span>
                <span class="uppercase">{statusWord.label}</span>
              </span>
            {/if}
            <a
              href="{paperlessUrl}/documents/{detail.paperlessId}/details"
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:text-accent-hover flex items-center gap-1 text-xs font-medium"
            >
              View in Paperless
              <ArrowSquareOutIcon class="h-3 w-3" />
            </a>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={XIcon}
          ariaLabel="Close"
          title="Close"
          class="shrink-0"
          onclick={onclose}
        />
      </div>

      {#if detail.truncation?.truncated}
        <p class="border-border text-muted border px-3 py-2 text-sm" role="status">
          Some values were shortened for safe review.
        </p>
      {/if}

      <!-- Skipped Banner -->
      {#if detail.appliedStatus === 'skipped' && detail.errorMessage}
        <div class="border-warn bg-warn-light border p-3">
          <div class="flex items-start gap-2">
            <span class="status-word text-warn mt-0.5"><span aria-hidden="true">◆</span> WARN</span>
            <div class="min-w-0 space-y-1">
              <p class="text-ink text-sm font-semibold">No OCR Text</p>
              <p class="text-ink-light text-sm">
                This document has no text content. Run OCR in Paperless-NGX, then re-sync and retry.
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Error Banner -->
      {#if detail.appliedStatus === 'failed'}
        <div class="border-ember bg-ember-light border p-3">
          <div class="flex items-start gap-2">
            <span class="status-word text-ember mt-0.5">
              <span aria-hidden="true">●</span> FAIL
            </span>
            <div class="min-w-0 space-y-1">
              <p class="text-ink text-sm font-semibold">
                {isExtractionFailure() ? 'Extraction Failed' : 'Apply Failed'}
              </p>
              <p class="text-ink-light text-sm">
                {isExtractionFailure()
                  ? 'The extraction did not complete. Retry when the underlying issue is resolved.'
                  : 'The reviewed apply conflicted with newer document data. Review the current values again.'}
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Document Preview -->
      <AiDocumentPreview src={detail.previewUrl} mode="preview" />

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
          <blockquote class="border-border-hover text-muted border-l-2 pl-3 text-sm">
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
          <dd class="text-ink font-mono">{detail.provider}</dd>
          <dt class="text-muted">Model</dt>
          <dd class="text-ink font-mono">{detail.model}</dd>
          <dt class="text-muted">Prompt Tokens</dt>
          <dd class="text-ink font-mono tabular-nums">
            {detail.promptTokens?.toLocaleString() ?? '--'}
          </dd>
          <dt class="text-muted">Completion Tokens</dt>
          <dd class="text-ink font-mono tabular-nums">
            {detail.completionTokens?.toLocaleString() ?? '--'}
          </dd>
          <dt class="text-muted">Processing Time</dt>
          <dd class="text-ink font-mono tabular-nums">
            {formatDuration(detail.processingTimeMs)}
          </dd>
          <dt class="text-muted">Created At</dt>
          <dd class="text-ink font-mono">{formatDate(detail.createdAt)}</dd>
        </dl>
      </div>
    </div>

    <!-- Action Footer -->
    {#if isReviewable}
      <div class="border-border bg-surface sticky bottom-0 flex gap-2 border-t px-4 py-3">
        <Button
          icon={CheckIcon}
          class="flex-1"
          loading={isApplying}
          disabled={readOnly || checkedCount === 0}
          title={readOnly ? 'Paperless is read-only' : undefined}
          onclick={handleApply}
        >
          {isApplying
            ? 'Applying...'
            : `Apply ${checkedCount} field${checkedCount !== 1 ? 's' : ''}`}
        </Button>
        <!-- Apply is the one primary action here; Reject is neutral. -->
        <Button variant="outline" icon={XIcon} disabled={isRejecting} onclick={handleReject}>
          Reject
        </Button>
      </div>
    {/if}

    {#if (detail.appliedStatus === 'applied' || detail.appliedStatus === 'partial') && onrevert}
      <div class="border-border bg-surface sticky bottom-0 flex border-t px-4 py-3">
        <Button
          variant="outline"
          class="flex-1"
          disabled={readOnly || isApplying || checkedCount === 0}
          title={readOnly ? 'Paperless is read-only' : undefined}
          onclick={handleRevert}
        >
          Revert selected audited fields
        </Button>
      </div>
    {/if}

    {#if detail.appliedStatus === 'failed' && detail.failureType !== 'review_conflict'}
      <div class="border-border bg-surface sticky bottom-0 flex gap-3 border-t px-4 py-3">
        {#if isExtractionFailure()}
          <Button
            icon={ArrowsClockwiseIcon}
            class="flex-1"
            loading={isReprocessing}
            onclick={handleReprocess}
          >
            {isReprocessing ? 'Retrying Extraction...' : 'Retry Extraction'}
          </Button>
        {:else}
          <Button
            icon={ArrowsClockwiseIcon}
            class="flex-1"
            loading={isRetrying}
            disabled={readOnly}
            title={readOnly ? 'Paperless is read-only' : undefined}
            onclick={handleRetry}
          >
            {isRetrying ? 'Retrying...' : 'Retry Apply'}
          </Button>
        {/if}
      </div>
    {/if}
  {/if}
{/snippet}
