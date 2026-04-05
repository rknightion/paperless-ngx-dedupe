<script lang="ts">
  import {
    X,
    ExternalLink,
    Loader2,
    AlertCircle,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Check,
  } from 'lucide-svelte';
  import {
    getActiveResultId,
    getActiveResultDetail,
    getDetailLoadState,
    getFieldSelection,
    toggleField,
    fieldSelections,
    selectResult,
  } from './AiReviewStore.svelte';
  import AiFieldDiffCard from './AiFieldDiffCard.svelte';
  import AiDocumentPreview from './AiDocumentPreview.svelte';

  interface Props {
    mobile?: boolean;
    paperlessUrl?: string;
    extractEnabled?: {
      title: boolean;
      correspondent: boolean;
      documentType: boolean;
      tags: boolean;
    };
    onapply: (
      id: string,
      fields: string[],
      options: { allowClearing: boolean; createMissingEntities: boolean },
    ) => Promise<void>;
    onreject: (id: string) => Promise<void>;
    onreprocess: (id: string) => Promise<void>;
    onclose: () => void;
  }

  let {
    mobile = false,
    paperlessUrl = '',
    extractEnabled = { title: true, correspondent: true, documentType: true, tags: true },
    onapply,
    onreject,
    onreprocess,
    onclose,
  }: Props = $props();

  let contentText = $state<string | null>(null);
  let contentLoading = $state(false);
  let contentExpanded = $state(false);
  let isApplying = $state(false);
  let isRejecting = $state(false);
  let isRetrying = $state(false);
  let isReprocessing = $state(false);

  const activeId = $derived(getActiveResultId());
  const detail = $derived(getActiveResultDetail());
  const loadState = $derived(getDetailLoadState());

  const checkedFields = $derived(() => {
    if (!activeId || !detail) return [] as string[];
    const sel = fieldSelections.get(activeId);
    return sel ? [...sel] : [];
  });

  const checkedCount = $derived(checkedFields().length);

  const isExtractionFailure = $derived(() => {
    if (!detail || detail.appliedStatus !== 'failed') return false;
    return (
      !detail.suggestedTitle &&
      !detail.suggestedCorrespondent &&
      !detail.suggestedDocumentType &&
      detail.suggestedTags.length === 0
    );
  });

  // Fetch document content when active result changes
  $effect(() => {
    const docId = detail?.documentId;
    if (!docId) {
      contentText = null;
      return;
    }
    contentLoading = true;
    contentExpanded = false;
    fetch(`/api/v1/documents/${docId}/content`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load content');
        return res.json();
      })
      .then((json) => {
        contentText = json.data?.content ?? json.content ?? null;
      })
      .catch(() => {
        contentText = null;
      })
      .finally(() => {
        contentLoading = false;
      });
  });

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

  const contentPreview = $derived(
    contentText && contentText.length > 500 && !contentExpanded
      ? contentText.slice(0, 500) + '...'
      : contentText,
  );

  function isFieldChecked(field: string): boolean {
    if (!activeId) return false;
    const sel = fieldSelections.get(activeId);
    return sel ? sel.has(field) : false;
  }

  function handleFieldCheck(field: string, checked: boolean): void {
    if (!activeId) return;
    // Ensure field selection exists
    if (detail) {
      getFieldSelection(activeId, detail);
    }
    if (checked !== isFieldChecked(field)) {
      toggleField(activeId, field);
    }
  }

  async function handleApply(): Promise<void> {
    if (!activeId || checkedCount === 0) return;
    isApplying = true;
    try {
      await onapply(activeId, checkedFields(), {
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
    if (!activeId) return;
    isRetrying = true;
    try {
      await onapply(activeId, ['title', 'correspondent', 'documentType', 'tags'], {
        allowClearing: false,
        createMissingEntities: true,
      });
    } finally {
      isRetrying = false;
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
        onclick={() => activeId && selectResult(activeId)}
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
      {#if detail.appliedStatus === 'failed' && detail.errorMessage}
        <div class="bg-ember-light/30 border-ember/20 space-y-2 rounded-lg border p-4">
          <div class="flex items-start gap-2">
            <AlertCircle class="text-ember mt-0.5 h-4 w-4 shrink-0" />
            <div class="min-w-0 space-y-1">
              <p class="text-ember text-sm font-semibold">
                {isExtractionFailure() ? 'Extraction Failed' : 'Apply Failed'}
              </p>
              {#if detail.failureType}
                <span
                  class="bg-ember-light text-ember rounded-full px-2 py-0.5 text-xs font-medium"
                >
                  {detail.failureType}
                </span>
              {/if}
            </div>
          </div>
          <pre
            class="text-ink bg-canvas rounded p-3 text-xs whitespace-pre-wrap">{detail.errorMessage}</pre>
        </div>
      {/if}

      <!-- Document Preview -->
      <AiDocumentPreview paperlessId={detail.paperlessId} mode="preview" />

      <!-- Suggestions -->
      <div class="space-y-3">
        <h3 class="text-ink text-sm font-semibold">Suggestions</h3>
        <AiFieldDiffCard
          fieldName="title"
          fieldLabel="Title"
          currentValue={detail.currentTitle}
          suggestedValue={detail.suggestedTitle}
          confidence={detail.confidence?.title ?? null}
          checked={isFieldChecked('title')}
          oncheck={(c) => handleFieldCheck('title', c)}
          disabled={detail.appliedStatus !== 'pending_review'}
          fieldDisabledByConfig={!extractEnabled.title}
        />
        <AiFieldDiffCard
          fieldName="correspondent"
          fieldLabel="Correspondent"
          currentValue={detail.currentCorrespondent}
          suggestedValue={detail.suggestedCorrespondent}
          confidence={detail.confidence?.correspondent ?? null}
          checked={isFieldChecked('correspondent')}
          oncheck={(c) => handleFieldCheck('correspondent', c)}
          disabled={detail.appliedStatus !== 'pending_review'}
          fieldDisabledByConfig={!extractEnabled.correspondent}
        />
        <AiFieldDiffCard
          fieldName="documentType"
          fieldLabel="Document Type"
          currentValue={detail.currentDocumentType}
          suggestedValue={detail.suggestedDocumentType}
          confidence={detail.confidence?.documentType ?? null}
          checked={isFieldChecked('documentType')}
          oncheck={(c) => handleFieldCheck('documentType', c)}
          disabled={detail.appliedStatus !== 'pending_review'}
          fieldDisabledByConfig={!extractEnabled.documentType}
        />
        <AiFieldDiffCard
          fieldName="tags"
          fieldLabel="Tags"
          currentValue={detail.currentTags}
          suggestedValue={detail.suggestedTags}
          confidence={detail.confidence?.tags ?? null}
          checked={isFieldChecked('tags')}
          oncheck={(c) => handleFieldCheck('tags', c)}
          disabled={detail.appliedStatus !== 'pending_review'}
          fieldDisabledByConfig={!extractEnabled.tags}
        />
      </div>

      <!-- Evidence -->
      {#if detail.evidence}
        <div class="space-y-2">
          <h3 class="text-ink text-sm font-semibold">Evidence</h3>
          <blockquote class="border-accent text-muted border-l-2 pl-3 text-sm italic">
            {detail.evidence}
          </blockquote>
        </div>
      {/if}

      <!-- Content Excerpt -->
      <div class="space-y-2">
        <h3 class="text-ink text-sm font-semibold">Document Content</h3>
        {#if contentLoading}
          <div class="bg-canvas-deep h-24 animate-pulse rounded-lg"></div>
        {:else if contentText}
          <pre
            class="text-muted bg-canvas max-h-48 overflow-y-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{contentPreview}</pre>
          {#if contentText.length > 500}
            <button
              onclick={() => (contentExpanded = !contentExpanded)}
              class="text-accent hover:text-accent-hover flex items-center gap-1 text-xs font-medium"
            >
              {#if contentExpanded}
                <ChevronUp class="h-3 w-3" />
                Show less
              {:else}
                <ChevronDown class="h-3 w-3" />
                Show more
              {/if}
            </button>
          {/if}
        {:else}
          <p class="text-muted text-sm italic">No content available</p>
        {/if}
      </div>

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
    {#if detail.appliedStatus === 'pending_review'}
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

    {#if detail.appliedStatus === 'failed'}
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
