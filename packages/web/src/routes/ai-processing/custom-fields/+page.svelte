<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle, Database, Loader2, Sparkles } from 'lucide-svelte';
  import type {
    CustomFieldCandidateV2,
    PublicCustomFieldDiscoveryRun,
  } from '@paperless-dedupe/core';
  import {
    loadLatestCustomFieldDiscovery,
    runCustomFieldDiscovery,
  } from '$lib/components/ai/custom-field-discovery-client';

  let run = $state<PublicCustomFieldDiscoveryRun | null>(null);
  let loading = $state(false);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let existingFieldsUnavailable = $state(false);

  const result = $derived(run?.result ?? null);

  onMount(() => {
    void loadLatestCustomFieldDiscovery()
      .then((latest) => {
        run = latest;
      })
      .catch(() => {
        // A missing historic result should not prevent a fresh local scan.
      });
  });

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  async function generateRecommendations() {
    loading = true;
    error = null;
    status = null;
    existingFieldsUnavailable = false;
    try {
      run = await runCustomFieldDiscovery({
        onStatus: (nextStatus) => {
          status =
            nextStatus === 'queued'
              ? 'Queued'
              : nextStatus === 'running'
                ? 'Scanning local OCR'
                : 'Recommendations ready';
        },
        onExistingFieldsUnavailable: () => {
          existingFieldsUnavailable = true;
        },
      });
    } catch {
      error = 'Custom-field discovery failed. You can safely retry the scan.';
    } finally {
      loading = false;
    }
  }

  function candidateTypeLabel(candidate: CustomFieldCandidateV2): string {
    return candidate.recommendedDataType === 'longtext'
      ? 'Long text'
      : candidate.recommendedDataType;
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
          Scan OCR held in the local database for recurring labelled values and recommend
          Paperless-NGX field types. The scan is bounded, does not use AI, and never creates or
          changes fields in Paperless.
        </p>
      </div>
      <button
        onclick={generateRecommendations}
        disabled={loading}
        class="bg-accent hover:bg-accent-hover flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {#if loading}
          <Loader2 class="h-4 w-4 animate-spin" />
          {status ?? 'Starting scan…'}
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

  {#if existingFieldsUnavailable}
    <div class="bg-warn-light text-warn flex items-start gap-2 rounded-lg p-4 text-sm">
      <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
      Paperless custom fields could not be checked. Review recommendations carefully because an existing
      field may be included.
    </div>
  {/if}

  {#if run?.status === 'failed'}
    <div class="bg-ember-light text-ember rounded-lg p-4 text-sm">
      The previous discovery run did not finish. Start a new scan to retry it.
    </div>
  {/if}

  {#if result}
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
        No recurring labelled values met the configured coverage thresholds.
      </div>
    {:else}
      <div class="space-y-3">
        {#each result.candidates as candidate (candidate.key)}
          <article class="panel">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="text-ink font-semibold">{candidate.name}</h3>
                <div class="mt-1 flex flex-wrap gap-2 text-xs">
                  <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 capitalize">
                    {candidateTypeLabel(candidate)}
                  </span>
                  <span class="bg-canvas text-muted rounded-full px-2 py-0.5">
                    {candidate.documentCount} documents · {formatPercent(candidate.coverage)}
                    coverage
                  </span>
                  <span class="bg-canvas text-muted rounded-full px-2 py-0.5">
                    {formatPercent(candidate.confidence)} confidence
                  </span>
                  {#if candidate.recommendation === 'review_carefully'}
                    <span class="bg-warn-light text-warn rounded-full px-2 py-0.5">
                      Review carefully
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="text-muted mt-3 text-sm">{candidate.rationale}</p>
            <p class="text-muted mt-2 text-xs">{candidate.recommendedGuidance}</p>
            {#if candidate.risks.length > 0}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each candidate.risks as risk (risk)}
                  <span class="bg-warn-light text-warn rounded-full px-2 py-0.5 text-xs">
                    {risk.replaceAll('_', ' ')}
                  </span>
                {/each}
              </div>
            {/if}
            {#if candidate.valueProfile.selectOptions?.length}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each candidate.valueProfile.selectOptions as option (option.value)}
                  <span class="bg-success-light text-success rounded-full px-2 py-0.5 text-xs">
                    {option.value} ({option.documentCount})
                  </span>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>
