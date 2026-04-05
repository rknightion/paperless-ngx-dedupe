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

<tr
  class="border-soft group border-b transition-colors last:border-b-0 {isActive
    ? 'border-l-accent bg-accent-subtle/40 border-l-2'
    : 'hover:bg-accent-subtle/40'}"
  {onclick}
>
  <td class="px-4 py-3">
    <input
      type="checkbox"
      checked={isSelected}
      onclick={(e) => {
        e.stopPropagation();
        onselect();
      }}
      class="rounded"
    />
  </td>
  <td class="px-4 py-3">
    <div class="flex items-center gap-2.5">
      {#if !thumbError}
        <img
          src={thumbSrc}
          alt=""
          class="h-8 w-8 shrink-0 rounded object-cover"
          onerror={() => (thumbError = true)}
        />
      {:else}
        <div class="bg-canvas flex h-8 w-8 shrink-0 items-center justify-center rounded">
          <FileText class="text-muted h-4 w-4" />
        </div>
      {/if}
      <span class="text-ink max-w-52 truncate font-medium">
        {result.documentTitle}
      </span>
    </div>
  </td>
  <td class="hidden px-4 py-3 md:table-cell">
    {#if result.suggestedTitle}
      <div class="space-y-0.5">
        {#if result.currentTitle && result.currentTitle !== result.suggestedTitle}
          <div class="text-muted max-w-52 truncate text-xs line-through">
            {result.currentTitle}
          </div>
        {/if}
        <div class="text-ink max-w-52 truncate text-sm">{result.suggestedTitle}</div>
      </div>
    {:else}
      <span class="text-soft">&mdash;</span>
    {/if}
  </td>
  <td class="hidden px-4 py-3 md:table-cell">
    {#if result.suggestedCorrespondent}
      <div class="space-y-0.5">
        {#if result.currentCorrespondent && result.currentCorrespondent !== result.suggestedCorrespondent}
          <div class="text-muted text-xs line-through">
            {result.currentCorrespondent}
          </div>
        {/if}
        <div class="text-ink text-sm">{result.suggestedCorrespondent}</div>
      </div>
    {:else}
      <span class="text-soft">&mdash;</span>
    {/if}
  </td>
  <td class="hidden px-4 py-3 md:table-cell">
    {#if result.suggestedDocumentType}
      <div class="space-y-0.5">
        {#if result.currentDocumentType && result.currentDocumentType !== result.suggestedDocumentType}
          <div class="text-muted text-xs line-through">
            {result.currentDocumentType}
          </div>
        {/if}
        <div class="text-ink text-sm">{result.suggestedDocumentType}</div>
      </div>
    {:else}
      <span class="text-soft">&mdash;</span>
    {/if}
  </td>
  <td class="hidden px-4 py-3 lg:table-cell">
    <div class="flex flex-wrap gap-1">
      {#each result.suggestedTags as tag (tag)}
        <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium">
          {tag}
        </span>
      {/each}
      {#if result.suggestedTags.length === 0}
        <span class="text-soft">&mdash;</span>
      {/if}
    </div>
  </td>
  <td class="px-4 py-3">
    {#if result.confidence}
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-muted w-9 text-[10px] font-medium uppercase">Title</span>
          <ConfidenceBadge score={result.confidence.title} />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted w-9 text-[10px] font-medium uppercase">Corr</span>
          <ConfidenceBadge score={result.confidence.correspondent} />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted w-9 text-[10px] font-medium uppercase">Type</span>
          <ConfidenceBadge score={result.confidence.documentType} />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-muted w-9 text-[10px] font-medium uppercase">Tags</span>
          <ConfidenceBadge score={result.confidence.tags} />
        </div>
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
    {:else}
      <span class="text-soft">&mdash;</span>
    {/if}
  </td>
  <td class="hidden px-4 py-3 sm:table-cell">
    <span
      class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
        result.appliedStatus,
      )}"
    >
      {statusDisplayText(result.appliedStatus)}
    </span>
  </td>
  <td class="px-4 py-3">
    {#if result.appliedStatus === 'pending_review' && !result.errorMessage}
      <div class="flex items-center gap-0.5">
        <button
          onclick={(e) => {
            e.stopPropagation();
            onapply();
          }}
          class="text-success hover:bg-success-light rounded-lg p-1.5 transition-colors"
          title="Apply suggestions"
        >
          <Check class="h-4 w-4" />
        </button>
        <button
          onclick={(e) => {
            e.stopPropagation();
            onreject();
          }}
          class="text-muted hover:text-ink hover:bg-canvas rounded-lg p-1.5 transition-colors"
          title="Reject suggestions"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    {:else}
      <span class="text-soft text-xs">&mdash;</span>
    {/if}
  </td>
</tr>
