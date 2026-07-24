<script lang="ts">
  import type { DuplicateMatchExplanation } from '@paperless-dedupe/core';

  interface Props {
    explanation: DuplicateMatchExplanation | null;
    comparisonDocumentId: string;
    primaryTitle?: string;
    comparisonTitle?: string;
  }

  let {
    explanation,
    comparisonDocumentId,
    primaryTitle = 'Primary',
    comparisonTitle = 'Compared document',
  }: Props = $props();

  let comparison = $derived(
    explanation?.comparisons.find((candidate) => candidate.documentId === comparisonDocumentId),
  );
</script>

{#if comparison}
  <section
    aria-label="Match explanation"
    class="border-soft bg-surface space-y-5 rounded-xl border p-4 sm:p-5"
  >
    <div>
      <h3 class="text-ink text-base font-semibold">Why these matched</h3>
      <p class="text-muted mt-1 text-sm">
        Structured details found in both documents. These support the match but should still be
        reviewed.
      </p>
    </div>

    {#if comparison.shared.length > 0}
      <dl class="grid gap-3 sm:grid-cols-2">
        {#each comparison.shared as entry (entry.category)}
          <div class="bg-canvas min-w-0 rounded-lg p-3">
            <dt class="text-muted text-xs font-medium tracking-wide uppercase">{entry.label}</dt>
            <dd class="mt-2 flex flex-wrap gap-1.5">
              {#each entry.values as value, index (`${entry.category}-shared-${index}`)}
                <span
                  class="border-soft bg-surface text-ink max-w-full rounded-md border px-2 py-1 font-mono text-xs break-all"
                >
                  {value}
                </span>
              {/each}
            </dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p class="border-soft bg-canvas text-muted rounded-lg border p-3 text-sm">
        No shared structured details were extracted. Review the scoring details and key differences
        before deciding.
      </p>
    {/if}

    <div class="border-soft border-t pt-5">
      <h3 class="text-ink text-base font-semibold">Key differences</h3>
      <p class="text-muted mt-1 text-sm">
        Check these values before choosing which document to keep.
      </p>
    </div>

    {#if comparison.differences.length > 0}
      <div class="space-y-3">
        {#each comparison.differences as entry (entry.category)}
          <section
            class="border-soft rounded-lg border p-3"
            aria-label={`${entry.label} differences`}
          >
            <h4 class="text-ink text-sm font-medium">{entry.label}</h4>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="min-w-0">
                <p class="text-muted truncate text-xs font-medium" title={primaryTitle}>
                  {primaryTitle}
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  {#each entry.primaryValues as value, index (`${entry.category}-primary-${index}`)}
                    <span
                      class="bg-canvas text-ink max-w-full rounded-md px-2 py-1 font-mono text-xs break-all"
                    >
                      {value}
                    </span>
                  {:else}
                    <span class="text-muted text-xs">Not found</span>
                  {/each}
                </div>
              </div>
              <div class="min-w-0">
                <p class="text-muted truncate text-xs font-medium" title={comparisonTitle}>
                  {comparisonTitle}
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  {#each entry.comparisonValues as value, index (`${entry.category}-comparison-${index}`)}
                    <span
                      class="bg-canvas text-ink max-w-full rounded-md px-2 py-1 font-mono text-xs break-all"
                    >
                      {value}
                    </span>
                  {:else}
                    <span class="text-muted text-xs">Not found</span>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        {/each}
      </div>
    {:else}
      <p class="border-soft bg-canvas text-muted rounded-lg border p-3 text-sm">
        No differing structured details were extracted.
      </p>
    {/if}
  </section>
{/if}
