<script lang="ts">
  import { browser } from '$app/env';
  import { page } from '$app/state';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import { Button, Select } from '$lib/components';
  import { aiReviewHref } from './document-library-links';

  type LibraryItem = {
    id: string;
    paperlessId: number;
    title: string;
    correspondent: string | null;
    documentType: string | null;
    tags: string[];
    addedDate: string | null;
    hasOcr: boolean;
    duplicateGroupCount: number;
    duplicateGroupId: string | null;
    duplicateGroupStatus: string | null;
    aiStatus: string | null;
    aiFailureType: string | null;
    aiFreshness: 'fresh' | 'stale' | null;
  };

  interface Props {
    items: LibraryItem[];
    nextCursor: string | null;
    limit: 25 | 50 | 100;
    paperlessUrl: string;
  }

  let { items, nextCursor, limit, paperlessUrl }: Props = $props();
  let previousHref = $state('');
  let historyReady = $state(false);
  const HISTORY_KEY = 'paperless-dedupe:document-library-cursor-predecessors';

  function currentRelativeUrl(): string {
    return `${page.url.pathname}${page.url.search}`;
  }

  function relativeUrl(href: string): string {
    const url = new URL(href, page.url.href);
    return `${url.pathname}${url.search}`;
  }

  function readHistory(): Record<string, string> {
    if (!browser) return {};
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }

  function withQuery(updates: { cursor?: string; limit?: number }): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('library', 'true');
    if (updates.cursor) params.set('cursor', updates.cursor);
    else if ('cursor' in updates) params.delete('cursor');
    if (updates.limit !== undefined) params.set('limit', String(updates.limit));
    return `${page.url.pathname}?${params.toString()}`;
  }

  let nextHref = $derived(nextCursor ? withQuery({ cursor: nextCursor }) : '');

  function rememberPredecessor() {
    if (!browser || !nextHref) return;
    const history = readHistory();
    history[relativeUrl(nextHref)] = currentRelativeUrl();
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function changePageSize(value: string) {
    const nextLimit = Number(value);
    window.location.assign(withQuery({ cursor: undefined, limit: nextLimit }));
  }

  function returnTarget(): string {
    return currentRelativeUrl();
  }

  function duplicatesHref(item: LibraryItem): string | null {
    if (!item.duplicateGroupId) return null;
    const params = new URLSearchParams({ returnTo: returnTarget() });
    return `/duplicates/${encodeURIComponent(item.duplicateGroupId)}?${params.toString()}`;
  }

  $effect(() => {
    if (!browser) return;
    void page.url;
    previousHref = readHistory()[currentRelativeUrl()] ?? '';
    historyReady = true;
  });
</script>

<section class="space-y-3" aria-labelledby="document-library-heading">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 id="document-library-heading" class="text-ink text-lg font-semibold">Documents</h2>
      <p class="text-muted mt-1 text-sm">Newest Paperless additions appear first.</p>
    </div>
    <Select
      label="Documents per page"
      value={String(limit)}
      onchange={changePageSize}
      options={[
        { value: '25', label: '25' },
        { value: '50', label: '50' },
        { value: '100', label: '100' },
      ]}
    />
  </div>

  {#if items.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p class="text-muted max-w-md text-balance">No documents match these filters.</p>
      <p class="text-muted max-w-md text-sm text-balance">
        Clear or broaden the filters to see more documents.
      </p>
      <Button variant="outline" href="/documents?library=true">Clear filters</Button>
    </div>
  {:else}
    <!-- Below 768px the rows become a list: each cell wraps inside its row. -->
    <div class="border-border bg-surface max-w-full overflow-x-auto border">
      <table class="w-full text-sm max-md:block md:min-w-[760px]" aria-label="Document library">
        <thead class="max-md:hidden">
          <tr class="border-border-hover bg-surface border-b text-left">
            <th scope="col" class="label-micro bg-surface sticky top-0 py-1.5 pr-3 pl-6">
              Document
            </th>
            <th scope="col" class="label-micro bg-surface sticky top-0 px-3 py-1.5">
              Classification
            </th>
            <th scope="col" class="label-micro bg-surface sticky top-0 px-3 py-1.5">OCR</th>
            <th scope="col" class="label-micro bg-surface sticky top-0 px-3 py-1.5">
              Duplicate review
            </th>
            <th scope="col" class="label-micro bg-surface sticky top-0 px-3 py-1.5">AI review</th>
            <th scope="col" class="label-micro bg-surface sticky top-0 py-1.5 pr-6 pl-3 text-right">
              Added
            </th>
          </tr>
        </thead>
        <tbody class="max-md:block">
          {#each items as item (item.id)}
            {@const duplicateHref = duplicatesHref(item)}
            {@const aiHref = aiReviewHref(
              item.id,
              item.aiStatus,
              returnTarget(),
              item.aiFailureType,
            )}
            <tr
              class="border-border hover:bg-canvas-deep border-b max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-2 md:h-9"
            >
              <td class="max-w-sm py-1.5 pr-3 pl-0 max-md:w-full max-md:max-w-none md:pl-6">
                <div class="flex min-w-0 items-baseline gap-2">
                  <span class="text-muted shrink-0 font-mono text-sm tabular-nums">
                    Paperless #{item.paperlessId}
                  </span>
                  <a
                    href="{paperlessUrl}/documents/{item.paperlessId}/details"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open {item.title} in Paperless"
                    title={item.title}
                    class="text-ink hover:text-accent inline-flex min-w-0 items-center gap-1 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span class="truncate">{item.title}</span>
                    <ArrowSquareOutIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </td>
              <td class="px-0 py-1.5 max-md:w-full md:px-3">
                <span class="text-ink-light block max-md:mr-2 max-md:inline">
                  {item.correspondent ?? 'No correspondent'}
                </span>
                <span class="text-muted block text-xs max-md:inline">
                  {item.documentType ?? 'No document type'}
                </span>
                {#if item.tags.length > 0}
                  <span class="text-muted block max-w-48 truncate text-xs max-md:max-w-full">
                    {item.tags.join(', ')}
                  </span>
                {/if}
              </td>
              <td class="px-0 py-1.5 md:px-3">
                <span class="status-word uppercase {item.hasOcr ? 'text-success' : 'text-ember'}">
                  <span aria-hidden="true">{item.hasOcr ? '■' : '●'}</span>
                  {item.hasOcr ? 'Present' : 'Missing'}
                </span>
              </td>
              <td class="px-0 py-1.5 md:px-3 {duplicateHref ? '' : 'max-md:hidden'}">
                {#if duplicateHref}
                  <a
                    href={duplicateHref}
                    aria-label="Review duplicates for {item.title}"
                    class="text-accent hover:text-accent-hover rounded-sm font-mono text-sm font-semibold tabular-nums underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {item.duplicateGroupCount}
                    {item.duplicateGroupCount === 1 ? 'group' : 'groups'}
                  </a>
                  {#if item.duplicateGroupStatus}
                    <span class="text-muted block font-mono text-xs uppercase max-md:inline">
                      {item.duplicateGroupStatus.replaceAll('_', ' ')}
                    </span>
                  {/if}
                {:else}
                  <span class="text-muted font-mono text-sm">None</span>
                {/if}
              </td>
              <td class="px-0 py-1.5 md:px-3">
                {#if aiHref}
                  <a
                    href={aiHref}
                    aria-label="Review AI result for {item.title}"
                    class="text-accent hover:text-accent-hover rounded-sm font-mono text-xs uppercase underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {item.aiStatus?.replaceAll('_', ' ')}
                  </a>
                {:else}
                  <span class="text-muted font-mono text-xs uppercase">
                    {item.aiStatus ? item.aiStatus.replaceAll('_', ' ') : 'Unprocessed'}
                  </span>
                {/if}
                {#if item.aiFreshness}
                  <span class="text-muted block font-mono text-xs max-md:inline">
                    {item.aiFreshness}
                  </span>
                {/if}
              </td>
              <td
                class="text-muted px-0 py-1.5 font-mono text-xs tabular-nums max-md:ml-auto md:pr-6 md:pl-3 md:text-right"
              >
                {item.addedDate ? new Date(item.addedDate).toLocaleDateString() : 'Unknown'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <nav
    class="flex min-h-10 flex-wrap items-center justify-between gap-3"
    aria-label="Library pages"
  >
    <div>
      {#if previousHref}
        <Button variant="outline" href={previousHref}>Previous page</Button>
      {:else if historyReady && page.url.searchParams.has('cursor')}
        <span class="text-muted text-sm">Previous page unavailable for this direct link.</span>
      {/if}
    </div>
    {#if nextHref}
      <Button variant="outline" href={nextHref} onclick={rememberPredecessor}>Next page</Button>
    {/if}
  </nav>
</section>
