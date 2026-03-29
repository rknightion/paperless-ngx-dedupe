<script lang="ts">
  import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-svelte';
  import type { ApplyPreflightResult } from '@paperless-dedupe/core';

  interface Props {
    open: boolean;
    preflight: ApplyPreflightResult | null;
    loading: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { open, preflight, loading, onconfirm, oncancel }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let showNewEntities = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      showNewEntities = false;
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  const totalNewEntities = $derived(
    preflight
      ? preflight.newEntitiesCreated.correspondents.length +
          preflight.newEntitiesCreated.documentTypes.length +
          preflight.newEntitiesCreated.tags.length
      : 0,
  );

  const hasWarnings = $derived(
    preflight != null &&
      (totalNewEntities > 0 ||
        preflight.lowConfidenceCount > 0 ||
        preflight.destructiveClearCount > 0 ||
        preflight.noOpCount > 0),
  );

  const confidenceTotal = $derived(
    preflight
      ? preflight.confidenceDistribution.high +
          preflight.confidenceDistribution.medium +
          preflight.confidenceDistribution.low
      : 0,
  );

  function pct(value: number): string {
    if (confidenceTotal === 0) return '0';
    return ((value / confidenceTotal) * 100).toFixed(0);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (e.target === dialog) oncancel();
  }}
  class="border-soft bg-surface m-auto w-full max-w-lg rounded-xl border p-0 shadow-lg backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-200"
  aria-labelledby="preflight-title"
>
  <div class="flex max-h-[80vh] flex-col">
    {#if loading}
      <!-- Loading state -->
      <div class="flex flex-col items-center justify-center px-6 py-16">
        <Loader2 class="text-accent mb-4 h-8 w-8 animate-spin" />
        <p class="text-muted text-sm">Computing preflight summary...</p>
      </div>
    {:else if preflight}
      <!-- Header -->
      <div class="border-soft border-b px-6 py-4">
        <h2 id="preflight-title" class="text-ink text-lg font-semibold">
          Apply to {preflight.totalDocuments} document{preflight.totalDocuments === 1 ? '' : 's'}
        </h2>
        <p class="text-muted mt-1 text-sm">Review the changes before applying.</p>
      </div>

      <!-- Content -->
      <div class="flex-1 space-y-5 overflow-auto px-6 py-5">
        <!-- Field changes -->
        <div>
          <h3 class="text-ink mb-2 text-sm font-medium">Fields changed</h3>
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Title</span>
              <span class="text-ink font-medium">{preflight.fieldsChanged.title}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Correspondent</span>
              <span class="text-ink font-medium">{preflight.fieldsChanged.correspondent}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Document type</span>
              <span class="text-ink font-medium">{preflight.fieldsChanged.documentType}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Tags</span>
              <span class="text-ink font-medium">{preflight.fieldsChanged.tags}</span>
            </div>
          </div>
        </div>

        <!-- Confidence distribution -->
        <div>
          <h3 class="text-ink mb-2 text-sm font-medium">Confidence distribution</h3>
          {#if confidenceTotal > 0}
            <div class="mb-2 flex h-3 overflow-hidden rounded-full">
              {#if preflight.confidenceDistribution.high > 0}
                <div
                  class="bg-success"
                  style="width: {pct(preflight.confidenceDistribution.high)}%"
                ></div>
              {/if}
              {#if preflight.confidenceDistribution.medium > 0}
                <div
                  class="bg-warning"
                  style="width: {pct(preflight.confidenceDistribution.medium)}%"
                ></div>
              {/if}
              {#if preflight.confidenceDistribution.low > 0}
                <div
                  class="bg-ember"
                  style="width: {pct(preflight.confidenceDistribution.low)}%"
                ></div>
              {/if}
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="flex items-center gap-1.5">
                <span class="bg-success inline-block h-2 w-2 rounded-full"></span>
                <span class="text-muted">High {preflight.confidenceDistribution.high}</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="bg-warning inline-block h-2 w-2 rounded-full"></span>
                <span class="text-muted">Medium {preflight.confidenceDistribution.medium}</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="bg-ember inline-block h-2 w-2 rounded-full"></span>
                <span class="text-muted">Low {preflight.confidenceDistribution.low}</span>
              </span>
            </div>
          {:else}
            <p class="text-muted text-sm">No confidence data available.</p>
          {/if}
        </div>

        <!-- Warnings -->
        {#if hasWarnings}
          <div class="border-soft bg-canvas/60 space-y-2 rounded-lg border p-4">
            <div class="flex items-center gap-2">
              <AlertTriangle class="text-warning h-4 w-4 shrink-0" />
              <h3 class="text-ink text-sm font-medium">Warnings</h3>
            </div>
            <ul class="text-muted space-y-1.5 text-sm">
              {#if totalNewEntities > 0}
                <li class="flex items-start justify-between">
                  <span>
                    {totalNewEntities} new entit{totalNewEntities === 1 ? 'y' : 'ies'} will be created
                  </span>
                  <button
                    onclick={() => (showNewEntities = !showNewEntities)}
                    class="text-accent flex shrink-0 items-center gap-1 text-xs font-medium"
                  >
                    {showNewEntities ? 'Hide' : 'Show'}
                    {#if showNewEntities}
                      <ChevronUp class="h-3 w-3" />
                    {:else}
                      <ChevronDown class="h-3 w-3" />
                    {/if}
                  </button>
                </li>
                {#if showNewEntities}
                  <li class="border-soft ml-2 border-l pl-3">
                    {#if preflight.newEntitiesCreated.correspondents.length > 0}
                      <div class="mb-1">
                        <span class="text-ink text-xs font-medium">Correspondents:</span>
                        <span class="text-muted text-xs"
                          >{preflight.newEntitiesCreated.correspondents.join(', ')}</span
                        >
                      </div>
                    {/if}
                    {#if preflight.newEntitiesCreated.documentTypes.length > 0}
                      <div class="mb-1">
                        <span class="text-ink text-xs font-medium">Document types:</span>
                        <span class="text-muted text-xs"
                          >{preflight.newEntitiesCreated.documentTypes.join(', ')}</span
                        >
                      </div>
                    {/if}
                    {#if preflight.newEntitiesCreated.tags.length > 0}
                      <div>
                        <span class="text-ink text-xs font-medium">Tags:</span>
                        <span class="text-muted text-xs"
                          >{preflight.newEntitiesCreated.tags.join(', ')}</span
                        >
                      </div>
                    {/if}
                  </li>
                {/if}
              {/if}
              {#if preflight.lowConfidenceCount > 0}
                <li>
                  {preflight.lowConfidenceCount} low confidence result{preflight.lowConfidenceCount ===
                  1
                    ? ''
                    : 's'}
                </li>
              {/if}
              {#if preflight.destructiveClearCount > 0}
                <li>
                  {preflight.destructiveClearCount} field{preflight.destructiveClearCount === 1
                    ? ''
                    : 's'} will be cleared
                </li>
              {/if}
              {#if preflight.noOpCount > 0}
                <li>
                  {preflight.noOpCount} result{preflight.noOpCount === 1 ? '' : 's'}
                  {preflight.noOpCount === 1 ? 'is a' : 'are'} no-op{preflight.noOpCount === 1
                    ? ''
                    : 's'}
                </li>
              {/if}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="border-soft flex items-center justify-end gap-3 border-t px-6 py-4">
        <button
          onclick={oncancel}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onclick={onconfirm}
          class="rounded-lg px-4 py-2 text-sm font-medium text-white {hasWarnings
            ? 'bg-ember hover:opacity-90'
            : 'bg-accent hover:bg-accent-hover'}"
        >
          Apply {preflight.totalDocuments} Document{preflight.totalDocuments === 1 ? '' : 's'}
        </button>
      </div>
    {/if}
  </div>
</dialog>
