<script lang="ts">
  import { onMount } from 'svelte';
  import DatabaseIcon from 'phosphor-svelte/lib/DatabaseIcon';
  import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon';
  import { Button } from '$lib/components';
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
          <DatabaseIcon class="text-muted h-4 w-4" />
          Discover custom fields
        </h2>
        <p class="text-muted mt-1 max-w-3xl text-sm">
          Scan OCR held in the local database for recurring labelled values and recommend
          Paperless-NGX field types. The scan is bounded, does not use AI, and never creates or
          changes fields in Paperless.
        </p>
      </div>
      <Button icon={SparkleIcon} {loading} onclick={generateRecommendations}>
        {loading ? (status ?? 'Starting scan…') : 'Generate recommendations'}
      </Button>
    </div>
  </div>

  {#if error}
    <div class="border-ember bg-ember-light flex items-start gap-3 border p-3 text-sm">
      <span class="status-word text-ember"><span aria-hidden="true">●</span> FAIL</span>
      <span class="text-ink">{error}</span>
    </div>
  {/if}

  {#if existingFieldsUnavailable}
    <div class="border-warn bg-warn-light flex items-start gap-3 border p-3 text-sm">
      <span class="status-word text-warn"><span aria-hidden="true">◆</span> WARN</span>
      <span class="text-ink">
        Paperless custom fields could not be checked. Review recommendations carefully because an
        existing field may be included.
      </span>
    </div>
  {/if}

  {#if run?.status === 'failed'}
    <div class="border-ember bg-ember-light flex items-start gap-3 border p-3 text-sm">
      <span class="status-word text-ember"><span aria-hidden="true">●</span> FAIL</span>
      <span class="text-ink">
        The previous discovery run did not finish. Start a new scan to retry it.
      </span>
    </div>
  {/if}

  {#if result}
    <div class="bg-border border-border grid gap-px border sm:grid-cols-3">
      <div class="bg-surface px-6 py-3">
        <p class="label-micro">Documents scanned</p>
        <p class="text-ink text-2xl font-semibold tabular-nums">{result.documentsScanned}</p>
      </div>
      <div class="bg-surface px-6 py-3">
        <p class="label-micro">With OCR text</p>
        <p class="text-ink text-2xl font-semibold tabular-nums">{result.documentsWithOcr}</p>
      </div>
      <div class="bg-surface px-6 py-3">
        <p class="label-micro">Candidates</p>
        <p class="text-ink text-2xl font-semibold tabular-nums">{result.candidates.length}</p>
      </div>
    </div>

    {#if result.candidates.length === 0}
      <div class="panel text-muted text-sm">
        No recurring labelled values met the configured coverage thresholds.
      </div>
    {:else}
      <div class="border-border divide-border divide-y border-y">
        {#each result.candidates as candidate (candidate.key)}
          <article class="px-6 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="text-ink font-semibold">{candidate.name}</h3>
                <div
                  class="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs"
                >
                  <span class="text-ink-light capitalize">{candidateTypeLabel(candidate)}</span>
                  <span class="tabular-nums">
                    {candidate.documentCount} documents · {formatPercent(candidate.coverage)}
                    coverage
                  </span>
                  <span class="tabular-nums">{formatPercent(candidate.confidence)} confidence</span>
                  {#if candidate.recommendation === 'review_carefully'}
                    <span class="status-word text-warn">
                      <span aria-hidden="true">◆</span> REVIEW CAREFULLY
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="text-muted mt-3 text-sm">{candidate.rationale}</p>
            <p class="text-muted mt-2 text-sm">{candidate.recommendedGuidance}</p>
            {#if candidate.risks.length > 0}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each candidate.risks as risk (risk)}
                  <span class="border-warn text-ink border px-1.5 font-mono text-xs">
                    {risk.replaceAll('_', ' ')}
                  </span>
                {/each}
              </div>
            {/if}
            {#if candidate.valueProfile.selectOptions?.length}
              <div class="mt-3 flex flex-wrap gap-1">
                {#each candidate.valueProfile.selectOptions as option (option.value)}
                  <span class="border-border text-ink bg-canvas border px-1.5 font-mono text-xs">
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
