<script lang="ts">
  import { ConfidenceBadge } from '$lib/components';
  import { Check, X, FileText, AlertCircle } from 'lucide-svelte';
  import type { AiResultSummary } from './AiReviewStore.svelte';

  interface Props {
    result: AiResultSummary;
    isSelected: boolean;
    isActive: boolean;
    onselect: () => void;
    onclick: () => void;
    onapply: () => void;
    onreject: () => void;
  }

  let { result, isSelected, isActive, onselect, onclick, onapply, onreject }: Props = $props();

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
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  let thumbSrc = $derived(`/api/v1/paperless/documents/${result.paperlessId}/thumb`);
  let thumbError = $state(false);
</script>

<div
  class="panel relative cursor-pointer transition-colors {isActive
    ? 'border-l-accent bg-accent-subtle/40 border-l-2'
    : 'hover:bg-accent-subtle/40'}"
  {onclick}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick();
    }
  }}
  role="button"
  tabindex="0"
>
  <!-- Checkbox top-right -->
  <div class="absolute top-3 right-3">
    <input
      type="checkbox"
      checked={isSelected}
      onclick={(e) => {
        e.stopPropagation();
        onselect();
      }}
      class="rounded"
    />
  </div>

  <!-- Top section: thumbnail + title/status/confidence -->
  <div class="flex items-start gap-3 p-4 pr-10">
    {#if !thumbError}
      <img
        src={thumbSrc}
        alt=""
        class="h-12 w-12 shrink-0 rounded object-cover"
        onerror={() => (thumbError = true)}
      />
    {:else}
      <div class="bg-canvas flex h-12 w-12 shrink-0 items-center justify-center rounded">
        <FileText class="text-muted h-5 w-5" />
      </div>
    {/if}
    <div class="min-w-0 flex-1">
      <p class="text-ink truncate font-medium">{result.documentTitle}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
            result.appliedStatus,
          )}"
        >
          {statusDisplayText(result.appliedStatus)}
        </span>
        {#if result.confidence}
          <div class="flex items-center gap-1.5">
            <ConfidenceBadge score={result.confidence.title} />
            <ConfidenceBadge score={result.confidence.correspondent} />
            <ConfidenceBadge score={result.confidence.documentType} />
            <ConfidenceBadge score={result.confidence.tags} />
          </div>
        {:else if result.errorMessage}
          <div class="space-y-1">
            {#if result.failureType === 'no_content'}
              <span
                class="bg-warn-light text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                <AlertCircle class="h-3 w-3" /> No OCR Text
              </span>
            {:else if result.failureType === 'no_suggestions'}
              <span
                class="bg-warn-light text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                <AlertCircle class="h-3 w-3" /> No Suggestions
              </span>
            {:else}
              <span
                class="bg-ember-light text-ember inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                <AlertCircle class="h-3 w-3" /> Failed
              </span>
            {/if}
            <p class="text-muted line-clamp-2 text-xs">{result.errorMessage}</p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Middle: correspondent + document type -->
  <div class="border-soft flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-sm">
    <div class="min-w-0">
      <span class="text-muted text-xs font-medium uppercase">Title</span>
      {#if result.suggestedTitle}
        <div class="flex items-center gap-1.5">
          {#if result.currentTitle && result.currentTitle !== result.suggestedTitle}
            <span class="text-muted truncate text-xs line-through">{result.currentTitle}</span>
            <span class="text-muted text-xs">&rarr;</span>
          {/if}
          <span class="text-ink truncate">{result.suggestedTitle}</span>
        </div>
      {:else}
        <p class="text-soft">&mdash;</p>
      {/if}
    </div>
    <div class="min-w-0">
      <span class="text-muted text-xs font-medium uppercase">Correspondent</span>
      {#if result.suggestedCorrespondent}
        <div class="flex items-center gap-1.5">
          {#if result.currentCorrespondent && result.currentCorrespondent !== result.suggestedCorrespondent}
            <span class="text-muted text-xs line-through">{result.currentCorrespondent}</span>
            <span class="text-muted text-xs">&rarr;</span>
          {/if}
          <span class="text-ink">{result.suggestedCorrespondent}</span>
        </div>
      {:else}
        <p class="text-soft">&mdash;</p>
      {/if}
    </div>
    <div class="min-w-0">
      <span class="text-muted text-xs font-medium uppercase">Document Type</span>
      {#if result.suggestedDocumentType}
        <div class="flex items-center gap-1.5">
          {#if result.currentDocumentType && result.currentDocumentType !== result.suggestedDocumentType}
            <span class="text-muted text-xs line-through">{result.currentDocumentType}</span>
            <span class="text-muted text-xs">&rarr;</span>
          {/if}
          <span class="text-ink">{result.suggestedDocumentType}</span>
        </div>
      {:else}
        <p class="text-soft">&mdash;</p>
      {/if}
    </div>
  </div>

  <!-- Tags -->
  {#if result.suggestedTags.length > 0}
    <div class="border-soft flex flex-wrap gap-1 border-t px-4 py-2.5">
      {#each result.suggestedTags as tag (tag)}
        <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium">
          {tag}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Bottom: actions -->
  {#if result.appliedStatus === 'pending_review' && !result.errorMessage}
    <div class="border-soft flex items-center gap-2 border-t px-4 py-2.5">
      <button
        onclick={(e) => {
          e.stopPropagation();
          onapply();
        }}
        class="bg-success-light text-success hover:bg-success/15 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <Check class="h-3.5 w-3.5" /> Apply
      </button>
      <button
        onclick={(e) => {
          e.stopPropagation();
          onreject();
        }}
        class="text-muted hover:text-ink hover:bg-canvas flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <X class="h-3.5 w-3.5" /> Reject
      </button>
    </div>
  {/if}
</div>
