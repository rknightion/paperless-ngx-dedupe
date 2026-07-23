<script lang="ts">
  import { Database, Loader2, Sparkles } from 'lucide-svelte';
  import type { CustomFieldCandidate, CustomFieldDiscoveryResult } from '@paperless-dedupe/core';

  type DiscoveryResponse = CustomFieldDiscoveryResult & {
    existingFieldNames: string[];
    warning: string | null;
  };

  let result = $state<DiscoveryResponse | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  async function generateRecommendations() {
    loading = true;
    error = null;
    try {
      const response = await fetch('/api/v1/ai/custom-fields/recommendations');
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Recommendation generation failed');
      result = json.data;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading = false;
    }
  }

  function candidateTypeLabel(candidate: CustomFieldCandidate): string {
    return candidate.dataType === 'longtext' ? 'Long text' : candidate.dataType;
  }
</script>

<div class="space-y-6">
  <div class="panel">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
          <Database class="text-accent h-5 w-5" />
          Discover Custom Fields
        </h2>
        <p class="text-muted mt-1 max-w-3xl text-sm">
          Scan all OCR text in the local database for recurring labelled values, infer an
          appropriate Paperless-NGX field type, and exclude custom fields that already exist.
          Nothing is created or changed in Paperless.
        </p>
      </div>
      <button
        onclick={generateRecommendations}
        disabled={loading}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {#if loading}
          <Loader2 class="h-4 w-4 animate-spin" />
          Analysing OCR…
        {:else}
          <Sparkles class="h-4 w-4" />
          Generate Recommendations
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <div class="bg-ember-light text-ember rounded-lg p-4 text-sm">{error}</div>
  {/if}

  {#if result}
    {#if result.warning}
      <div class="bg-warn-light text-warn rounded-lg p-4 text-sm">{result.warning}</div>
    {/if}

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="panel">
        <p class="text-muted text-xs font-medium uppercase">Documents scanned</p>
        <p class="text-ink mt-1 text-2xl font-semibold">{result.documentsScanned}</p>
      </div>
      <div class="panel">
        <p class="text-muted text-xs font-medium uppercase">With OCR text</p>
        <p class="text-ink mt-1 text-2xl font-semibold">{result.documentsWithOcr}</p>
      </div>
      <div class="panel">
        <p class="text-muted text-xs font-medium uppercase">Candidates</p>
        <p class="text-ink mt-1 text-2xl font-semibold">{result.candidates.length}</p>
      </div>
    </div>

    {#if result.candidates.length === 0}
      <div class="panel text-muted text-sm">
        No recurring labelled values met the minimum coverage threshold of
        {result.minimumDocumentCount} documents.
      </div>
    {:else}
      <div class="space-y-3">
        {#each result.candidates as candidate (candidate.name)}
          <article class="panel">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="text-ink font-semibold">{candidate.name}</h3>
                <div class="mt-1 flex flex-wrap gap-2 text-xs">
                  <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 capitalize">
                    {candidateTypeLabel(candidate)}
                  </span>
                  <span class="bg-canvas text-muted rounded-full px-2 py-0.5">
                    {candidate.documentCount} documents · {formatPercent(candidate.coverage)} coverage
                  </span>
                  <span class="bg-canvas text-muted rounded-full px-2 py-0.5">
                    {formatPercent(candidate.confidence)} confidence
                  </span>
                </div>
              </div>
            </div>
            <p class="text-muted mt-3 text-sm">{candidate.rationale}</p>
            {#if candidate.selectOptions}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each candidate.selectOptions as option (option)}
                  <span class="bg-success-light text-success rounded-full px-2 py-0.5 text-xs">
                    {option}
                  </span>
                {/each}
              </div>
            {:else}
              <p class="text-muted mt-3 text-xs">Examples: {candidate.examples.join(' · ')}</p>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>
