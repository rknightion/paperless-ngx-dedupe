<script lang="ts">
  import { page } from '$app/state';
  import { ConfidenceBadge } from '$lib/components';
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
  const titleChanged = $derived(
    Boolean(result.currentTitle) && result.currentTitle !== result.suggestedTitle,
  );
</script>

<tr
  class="border-border h-9 cursor-pointer border-b transition-colors {highlighted
    ? 'bg-selected shadow-[inset_2px_0_0_var(--color-accent)]'
    : 'hover:bg-canvas-deep'}"
  {onclick}
>
  <td class="py-0 pr-0 pl-6">
    <input
      type="checkbox"
      checked={isSelected}
      aria-label={`Select ${result.documentTitle}`}
      onclick={(e) => {
        e.stopPropagation();
        onselect();
      }}
      class="accent-accent h-3.5 w-3.5"
    />
  </td>
  <td class="max-w-0 px-3 py-0">
    <div class="flex items-baseline gap-1.5">
      <span class="text-muted shrink-0 font-mono text-sm tabular-nums">#{result.paperlessId}</span>
      <button
        type="button"
        class="text-ink hover:text-accent min-w-0 truncate text-left font-medium hover:underline"
        onclick={(event) => {
          event.stopPropagation();
          onclick();
        }}
      >
        {result.documentTitle}
      </button>
    </div>
  </td>
  <td class="max-w-0 truncate px-3 py-0 text-sm">
    {#if result.suggestedTitle}
      {#if titleChanged}
        <span class="text-muted line-through">{result.currentTitle}</span>
        <span class="text-muted font-mono" aria-hidden="true">&rarr;</span>
      {/if}
      <span class="text-ink font-medium">{result.suggestedTitle}</span>
    {:else}
      <span class="text-muted">None proposed</span>
    {/if}
  </td>
  <td class="px-3 py-0">
    {#if fieldCodes.length > 0}
      <span class="text-ink-light font-mono text-xs tracking-wider">{fieldCodes.join(' ')}</span>
    {:else}
      <span class="text-muted font-mono text-xs">none</span>
    {/if}
  </td>
  <td class="max-w-0 truncate px-3 py-0">
    {#if weakest}
      <span class="inline-flex items-baseline gap-2">
        <ConfidenceBadge score={weakest.score} />
        <span class="text-muted text-sm">lowest: {weakest.field}</span>
      </span>
    {:else if result.errorMessage}
      <span class="text-muted text-sm">{result.errorMessage}</span>
    {:else}
      <span class="text-muted font-mono text-xs">0</span>
    {/if}
  </td>
  <td class="py-0 pr-4 pl-3 text-right">
    {#if result.appliedStatus === 'pending_review' && !result.errorMessage}
      <span class="inline-flex gap-1">
        <button
          onclick={(e) => {
            e.stopPropagation();
            onapply();
          }}
          class="border-border text-success hover:bg-canvas-deep flex h-6 w-6 items-center justify-center rounded-sm border bg-transparent disabled:cursor-not-allowed"
          disabled={readOnly}
          aria-label="Apply suggestions"
          title={readOnly ? 'Paperless is read-only' : 'Apply suggestions'}
        >
          <CheckIcon class="h-3.5 w-3.5" />
        </button>
        <button
          onclick={(e) => {
            e.stopPropagation();
            onreject();
          }}
          class="border-border text-muted hover:bg-canvas-deep hover:text-ink flex h-6 w-6 items-center justify-center rounded-sm border bg-transparent"
          title="Reject suggestions"
        >
          <XIcon class="h-3.5 w-3.5" />
        </button>
      </span>
    {:else}
      <span class="status-word {status.colorClass}">
        <span aria-hidden="true">{status.shape}</span>
        <span class="uppercase">{status.label}</span>
      </span>
    {/if}
  </td>
</tr>
