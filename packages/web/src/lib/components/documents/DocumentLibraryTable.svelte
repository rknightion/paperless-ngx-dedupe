<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { ExternalLink } from 'lucide-svelte';
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
    return `${$page.url.pathname}${$page.url.search}`;
  }

  function relativeUrl(href: string): string {
    const url = new URL(href, $page.url);
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
    const params = new URLSearchParams($page.url.searchParams);
    params.set('library', 'true');
    if (updates.cursor) params.set('cursor', updates.cursor);
    else if ('cursor' in updates) params.delete('cursor');
    if (updates.limit !== undefined) params.set('limit', String(updates.limit));
    return `${$page.url.pathname}?${params.toString()}`;
  }

  let nextHref = $derived(nextCursor ? withQuery({ cursor: nextCursor }) : '');

  function rememberPredecessor() {
    if (!browser || !nextHref) return;
    const history = readHistory();
    history[relativeUrl(nextHref)] = currentRelativeUrl();
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function changePageSize(event: Event) {
    const nextLimit = Number((event.target as HTMLSelectElement).value);
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
    void $page.url;
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
    <label class="text-ink text-sm font-medium">
      Documents per page
      <select
        value={String(limit)}
        onchange={changePageSize}
        class="border-soft bg-surface ml-2 rounded-lg border px-2 py-1.5"
      >
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    </label>
  </div>

  {#if items.length === 0}
    <div class="panel py-10 text-center">
      <p class="text-ink font-medium">No documents match these filters.</p>
      <p class="text-muted mt-1 text-sm">Clear or broaden the filters to see more documents.</p>
    </div>
  {:else}
    <div class="border-soft max-w-full overflow-x-auto rounded-lg border">
      <table class="w-full min-w-[760px] text-sm" aria-label="Document library">
        <thead>
          <tr class="border-soft bg-canvas border-b text-left">
            <th class="text-muted px-3 py-3 font-medium">Document</th>
            <th class="text-muted px-3 py-3 font-medium">Classification</th>
            <th class="text-muted px-3 py-3 font-medium">OCR</th>
            <th class="text-muted px-3 py-3 font-medium">Duplicate review</th>
            <th class="text-muted px-3 py-3 font-medium">AI review</th>
            <th class="text-muted px-3 py-3 font-medium">Added</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index (item.id)}
            {@const duplicateHref = duplicatesHref(item)}
            {@const aiHref = aiReviewHref(
              item.id,
              item.aiStatus,
              returnTarget(),
              item.aiFailureType,
            )}
            <tr class="border-soft border-b {index % 2 === 0 ? 'bg-surface' : 'bg-canvas'}">
              <td class="max-w-xs px-3 py-3">
                <a
                  href="{paperlessUrl}/documents/{item.paperlessId}/details"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open {item.title} in Paperless"
                  class="text-accent inline-flex max-w-full items-center gap-1 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span class="truncate">{item.title}</span>
                  <ExternalLink class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
                <span class="text-muted mt-1 block text-xs">Paperless #{item.paperlessId}</span>
              </td>
              <td class="px-3 py-3">
                <span class="text-ink block">{item.correspondent ?? 'No correspondent'}</span>
                <span class="text-muted block text-xs"
                  >{item.documentType ?? 'No document type'}</span
                >
                {#if item.tags.length > 0}
                  <span class="text-muted block max-w-48 truncate text-xs"
                    >{item.tags.join(', ')}</span
                  >
                {/if}
              </td>
              <td class="px-3 py-3">
                <span class={item.hasOcr ? 'text-success' : 'text-ember'}>
                  {item.hasOcr ? 'Present' : 'Missing'}
                </span>
              </td>
              <td class="px-3 py-3">
                {#if duplicateHref}
                  <a
                    href={duplicateHref}
                    aria-label="Review duplicates for {item.title}"
                    class="text-accent rounded-sm font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {item.duplicateGroupCount}
                    {item.duplicateGroupCount === 1 ? 'group' : 'groups'}
                  </a>
                  {#if item.duplicateGroupStatus}
                    <span class="text-muted block text-xs">
                      {item.duplicateGroupStatus.replaceAll('_', ' ')}
                    </span>
                  {/if}
                {:else}
                  <span class="text-muted">None</span>
                {/if}
              </td>
              <td class="px-3 py-3">
                {#if aiHref}
                  <a
                    href={aiHref}
                    aria-label="Review AI result for {item.title}"
                    class="text-accent rounded-sm font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {item.aiStatus?.replaceAll('_', ' ')}
                  </a>
                {:else}
                  <span class="text-muted">
                    {item.aiStatus ? item.aiStatus.replaceAll('_', ' ') : 'Unprocessed'}
                  </span>
                {/if}
                {#if item.aiFreshness}
                  <span class="text-muted block text-xs">{item.aiFreshness}</span>
                {/if}
              </td>
              <td class="text-muted px-3 py-3">
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
        <a
          href={previousHref}
          class="border-soft text-ink rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Previous page
        </a>
      {:else if historyReady && $page.url.searchParams.has('cursor')}
        <span class="text-muted text-sm">Previous page unavailable for this direct link.</span>
      {/if}
    </div>
    {#if nextHref}
      <a
        href={nextHref}
        onclick={rememberPredecessor}
        class="bg-accent rounded-lg px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Next page
      </a>
    {/if}
  </nav>
</section>
