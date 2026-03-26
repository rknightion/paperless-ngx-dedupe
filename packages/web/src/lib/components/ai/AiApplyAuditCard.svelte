<script lang="ts">
  import { ArrowRight } from 'lucide-svelte';
  import type { AiResultDetail } from '@paperless-dedupe/core';

  interface Props {
    result: AiResultDetail;
  }

  let { result }: Props = $props();

  const hasSnapshot = $derived(
    result.preApplyCorrespondentName !== null ||
      result.preApplyDocumentTypeName !== null ||
      result.preApplyTagNames !== null,
  );

  const appliedFields = $derived(result.appliedFields ?? []);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="space-y-3">
  <h3 class="text-ink text-sm font-semibold">Apply Audit</h3>

  <!-- Applied timestamp -->
  {#if result.appliedAt}
    <div class="flex items-center gap-2 text-sm">
      <span class="text-muted">Applied at:</span>
      <span class="text-ink font-medium">{formatDate(result.appliedAt)}</span>
    </div>
  {/if}

  <!-- Reverted timestamp -->
  {#if result.revertedAt}
    <div class="flex items-center gap-2 text-sm">
      <span class="text-muted">Reverted at:</span>
      <span class="text-ink font-medium">{formatDate(result.revertedAt)}</span>
    </div>
  {/if}

  <!-- Applied fields -->
  {#if appliedFields.length > 0}
    <div class="flex items-center gap-2 text-sm">
      <span class="text-muted">Fields applied:</span>
      <div class="flex flex-wrap gap-1">
        {#each appliedFields as field (field)}
          <span class="bg-success-light text-success rounded-full px-2 py-0.5 text-xs font-medium"
            >{field}</span
          >
        {/each}
      </div>
    </div>
  {/if}

  <!-- Before / After diff -->
  {#if hasSnapshot}
    <div class="border-soft divide-soft divide-y rounded-lg border">
      <!-- Correspondent -->
      {#if appliedFields.includes('correspondent')}
        <div class="flex items-center gap-3 p-3">
          <span class="text-muted w-28 shrink-0 text-xs font-medium tracking-wider uppercase"
            >Correspondent</span
          >
          <span class="text-muted text-sm">{result.preApplyCorrespondentName ?? '(none)'}</span>
          <ArrowRight class="text-muted h-3.5 w-3.5 shrink-0" />
          <span class="text-ink text-sm font-medium"
            >{result.suggestedCorrespondent ?? '(none)'}</span
          >
        </div>
      {/if}

      <!-- Document Type -->
      {#if appliedFields.includes('documentType')}
        <div class="flex items-center gap-3 p-3">
          <span class="text-muted w-28 shrink-0 text-xs font-medium tracking-wider uppercase"
            >Doc Type</span
          >
          <span class="text-muted text-sm">{result.preApplyDocumentTypeName ?? '(none)'}</span>
          <ArrowRight class="text-muted h-3.5 w-3.5 shrink-0" />
          <span class="text-ink text-sm font-medium"
            >{result.suggestedDocumentType ?? '(none)'}</span
          >
        </div>
      {/if}

      <!-- Tags -->
      {#if appliedFields.includes('tags')}
        <div class="flex items-center gap-3 p-3">
          <span class="text-muted w-28 shrink-0 text-xs font-medium tracking-wider uppercase"
            >Tags</span
          >
          <div class="flex flex-wrap gap-1">
            {#each result.preApplyTagNames ?? [] as tag (tag)}
              <span class="bg-canvas-alt text-muted rounded-full px-2 py-0.5 text-xs">{tag}</span>
            {:else}
              <span class="text-muted text-xs">(none)</span>
            {/each}
          </div>
          <ArrowRight class="text-muted h-3.5 w-3.5 shrink-0" />
          <div class="flex flex-wrap gap-1">
            {#each result.suggestedTags as tag (tag)}
              <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium"
                >{tag}</span
              >
            {:else}
              <span class="text-muted text-xs">(none)</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else if result.appliedStatus === 'rejected'}
    <p class="text-muted text-sm italic">No changes were applied (result was rejected).</p>
  {:else}
    <p class="text-muted text-sm italic">No pre-apply snapshot available.</p>
  {/if}
</div>
