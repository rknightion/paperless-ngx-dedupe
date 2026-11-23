<script lang="ts">
  import { page } from '$app/state';
  import { Button, Checkbox, ConfidenceBadge } from '$lib/components';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import type { AiResultSummary } from './AiReviewStore.svelte';
  import { aiStatusWord, proposedFieldCodes, weakestConfidence } from './ai-status';

  const readOnly = $derived(page.data.readOnly === true);

  interface Props {
    result: AiResultSummary & { thumbnailUrl?: string };
    isSelected: boolean;
    isActive: boolean;
    onselect: () => void;
    onclick: () => void;
    onapply: () => void;
    onreject: () => void;
  }

  let { result, isSelected, isActive, onselect, onclick, onapply, onreject }: Props = $props();

  const status = $derived(aiStatusWord(result.appliedStatus));
  const fieldCodes = $derived(proposedFieldCodes(result));
  const weakest = $derived(weakestConfidence(result));
  const highlighted = $derived(isSelected || isActive);
</script>

<div
  class="relative cursor-pointer px-4 py-3 transition-colors {highlighted
    ? 'bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
    : 'hover:bg-canvas-deep'}"
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
  <!-- The wrapper keeps a click on the checkbox from also opening the row. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="absolute top-3 right-3" onclick={(e) => e.stopPropagation()}>
    <Checkbox
      checked={isSelected}
      ariaLabel={`Select ${result.documentTitle}`}
      onchange={() => onselect()}
    />
  </div>

  <div class="min-w-0 pr-10">
    <p class="text-ink truncate font-medium">{result.documentTitle}</p>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="status-word {status.colorClass}">
        <span aria-hidden="true">{status.shape}</span>
        <span class="uppercase">{status.label}</span>
      </span>
      {#if weakest}
        <ConfidenceBadge score={weakest.score} />
        <span class="text-muted text-sm">lowest: {weakest.field}</span>
      {/if}
      {#if fieldCodes.length > 0}
        <span class="text-ink-light font-mono text-xs tracking-wider">{fieldCodes.join(' ')}</span>
      {/if}
    </div>
    {#if result.errorMessage}
      <p class="text-muted mt-1 line-clamp-2 text-sm">{result.errorMessage}</p>
    {/if}
  </div>

  <div class="mt-2 space-y-1 text-sm">
    {#if result.suggestedTitle}
      <div class="truncate">
        <span class="label-micro mr-2">Title</span>
        {#if result.currentTitle && result.currentTitle !== result.suggestedTitle}
          <span class="text-muted line-through">{result.currentTitle}</span>
          <span class="text-muted font-mono" aria-hidden="true">&rarr;</span>
        {/if}
        <span class="text-ink font-medium">{result.suggestedTitle}</span>
      </div>
    {/if}
    {#if result.suggestedCorrespondent}
      <div class="truncate">
        <span class="label-micro mr-2">Correspondent</span>
        {#if result.currentCorrespondent && result.currentCorrespondent !== result.suggestedCorrespondent}
          <span class="text-muted line-through">{result.currentCorrespondent}</span>
          <span class="text-muted font-mono" aria-hidden="true">&rarr;</span>
        {/if}
        <span class="text-ink font-medium">{result.suggestedCorrespondent}</span>
      </div>
    {/if}
    {#if result.suggestedDocumentType}
      <div class="truncate">
        <span class="label-micro mr-2">Type</span>
        {#if result.currentDocumentType && result.currentDocumentType !== result.suggestedDocumentType}
          <span class="text-muted line-through">{result.currentDocumentType}</span>
          <span class="text-muted font-mono" aria-hidden="true">&rarr;</span>
        {/if}
        <span class="text-ink font-medium">{result.suggestedDocumentType}</span>
      </div>
    {/if}
    {#if result.suggestedTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="label-micro mr-1">Tags</span>
        {#each result.suggestedTags as tag (tag)}
          <span class="border-border text-ink bg-canvas border px-1.5 font-mono text-xs">
            {tag}
          </span>
        {/each}
      </div>
    {/if}
    {#if result.suggestedCustomFields.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="label-micro mr-1">Custom</span>
        {#each result.suggestedCustomFields as field (field.fieldId)}
          <span class="border-border text-ink bg-canvas border px-1.5 font-mono text-xs">
            {field.fieldName ?? `Field #${field.fieldId}`}: {Array.isArray(field.value)
              ? field.value.join(', ')
              : String(field.value)}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if result.appliedStatus === 'pending_review' && !result.errorMessage}
    <div class="mt-3 flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={CheckIcon}
        disabled={readOnly}
        title={readOnly ? 'Paperless is read-only' : undefined}
        onclick={(e) => {
          e.stopPropagation();
          onapply();
        }}
      >
        Apply
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={XIcon}
        onclick={(e) => {
          e.stopPropagation();
          onreject();
        }}
      >
        Reject
      </Button>
    </div>
  {/if}
</div>
