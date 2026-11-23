<script lang="ts">
  import {
    libraryHref,
    qualitySummaryHref,
    type DocumentLibraryLinkQuery,
  } from './document-library-links';

  interface Props {
    counts: {
      total: number;
      missingOcr: number;
      duplicateInvolved: number;
      aiUnprocessed: number;
      aiStale: number;
    };
    query: DocumentLibraryLinkQuery;
    insights: Insight[];
  }

  type Insight = { kind: string; count: number; label: string; url: string };

  let { counts, query, insights }: Props = $props();

  function safeInsightUrl(url: string): boolean {
    return url.startsWith('/documents?library=true') || url === '/ai-processing/custom-fields';
  }

  let safeInsights = $derived(insights.filter((insight) => safeInsightUrl(insight.url)));
  let missingOcrHref = $derived(qualitySummaryHref(query, 'missingOcr'));
  let duplicateHref = $derived(qualitySummaryHref(query, 'duplicateInvolved'));
  let unprocessedHref = $derived(qualitySummaryHref(query, 'aiUnprocessed'));
  let staleHref = $derived(qualitySummaryHref(query, 'aiStale'));
</script>

<section class="space-y-3" aria-labelledby="library-quality-heading">
  <div>
    <h2 id="library-quality-heading" class="text-ink text-lg font-semibold">Library quality</h2>
    <p class="text-muted mt-1 text-sm">
      Counts reflect the complete filtered result, not just this page.
    </p>
  </div>
  <div class="border-border bg-surface flex flex-wrap border-t border-l">
    {@render SummaryCard('Matching documents', counts.total, libraryHref(query))}
    {@render SummaryCard('Missing OCR', counts.missingOcr, missingOcrHref)}
    {@render SummaryCard('In duplicate groups', counts.duplicateInvolved, duplicateHref)}
    {@render SummaryCard('AI unprocessed', counts.aiUnprocessed, unprocessedHref)}
    {@render SummaryCard('AI stale', counts.aiStale, staleHref)}
  </div>

  <div class="panel space-y-3" aria-labelledby="library-opportunities-heading">
    <div>
      <h3 id="library-opportunities-heading" class="text-ink font-semibold">
        Library opportunities
      </h3>
      <p class="text-muted mt-1 text-sm">Whole-library checks for metadata worth reviewing.</p>
    </div>
    {#if safeInsights.length === 0}
      <p class="text-muted text-sm">No quality opportunities found.</p>
    {:else}
      <ul class="grid gap-x-6 sm:grid-cols-2">
        {#each safeInsights as insight (`${insight.kind}:${insight.url}`)}
          <li class="border-border border-b">
            <a
              href={insight.url}
              class="hover:bg-canvas-deep flex h-full items-start justify-between gap-3 px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span class="text-ink">{insight.label}</span>
              <strong class="text-accent shrink-0 font-mono font-semibold tabular-nums">
                {insight.count.toLocaleString()}
              </strong>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

{#snippet SummaryCard(label: string, count: number, href: string | null)}
  {#if href}
    <a
      {href}
      class="border-border hover:bg-canvas-deep min-w-40 flex-1 border-r border-b px-6 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <span class="label-micro block">{label}</span>
      <strong class="text-ink block text-2xl font-semibold tabular-nums">
        {count.toLocaleString()}
      </strong>
    </a>
  {:else}
    <div
      class="border-border min-w-40 flex-1 border-r border-b px-6 py-3"
      aria-label="{label}: {count}"
    >
      <span class="label-micro block">{label}</span>
      <strong class="text-ink block text-2xl font-semibold tabular-nums">
        {count.toLocaleString()}
      </strong>
      <span class="text-muted block font-mono text-xs">
        Current filters exclude this population.
      </span>
    </div>
  {/if}
{/snippet}
