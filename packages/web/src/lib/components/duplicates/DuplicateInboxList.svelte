<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import {
    ConfidenceBadge,
    ConfidenceTooltipContent,
    RichTooltip,
    StatusBadge,
  } from '$lib/components';

  type Group = {
    id: string;
    primaryDocumentTitle: string | null;
    memberCount: number;
    confidenceScore: number;
    jaccardSimilarity: number | null;
    fuzzyTextRatio: number | null;
    discriminativeScore: number | null;
    status: string;
    updatedAt: string;
  };

  interface Props {
    groups: Group[];
    total: number;
    limit: number;
    offset: number;
    paginationMode: 'inbox' | 'legacy';
    nextCursor?: string | null;
    selectedIds: Set<string>;
    onselectionchange: (ids: Set<string>) => void;
    onpreview: (group: Group) => void;
  }

  let {
    groups,
    total,
    limit,
    offset,
    paginationMode,
    nextCursor,
    selectedIds,
    onselectionchange,
    onpreview,
  }: Props = $props();

  let allSelected = $derived(groups.length > 0 && selectedIds.size === groups.length);
  let cursorPreviousHref = $state('');
  let cursorHistoryReady = $state(false);
  const CURSOR_HISTORY_KEY = 'paperless-dedupe:duplicate-cursor-predecessors';

  function currentRelativeUrl(): string {
    return `${$page.url.pathname}${$page.url.search}`;
  }

  function readCursorHistory(): Record<string, string> {
    if (!browser) return {};
    try {
      return JSON.parse(sessionStorage.getItem(CURSOR_HISTORY_KEY) ?? '{}') as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }

  function relativeUrl(href: string): string {
    const url = new URL(href, $page.url);
    return `${url.pathname}${url.search}`;
  }

  function detailHref(id: string): string {
    const returnParams = $page.url.searchParams.toString();
    return returnParams
      ? `/duplicates/${id}?returnParams=${encodeURIComponent(returnParams)}`
      : `/duplicates/${id}`;
  }

  function rememberCursorPredecessor(next: string) {
    if (!browser || paginationMode !== 'inbox') return;
    const history = readCursorHistory();
    history[relativeUrl(next)] = currentRelativeUrl();
    sessionStorage.setItem(CURSOR_HISTORY_KEY, JSON.stringify(history));
  }

  $effect(() => {
    if (!browser) return;
    void $page.url;
    cursorPreviousHref = readCursorHistory()[currentRelativeUrl()] ?? '';
    cursorHistoryReady = true;
  });

  function withPage(update: { cursor?: string; offset?: number; limit?: number }): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    if (update.cursor) params.set('cursor', update.cursor);
    else if ('cursor' in update) params.delete('cursor');
    if (update.offset !== undefined) params.set('offset', String(update.offset));
    else if ('offset' in update) params.delete('offset');
    if (update.limit !== undefined) params.set('limit', String(update.limit));
    return `?${params.toString()}`;
  }

  let nextHref = $derived(
    paginationMode === 'inbox'
      ? nextCursor
        ? withPage({ cursor: nextCursor, offset: undefined })
        : ''
      : offset + limit < total
        ? withPage({ offset: offset + limit, cursor: undefined })
        : '',
  );
  let previousHref = $derived(
    paginationMode === 'legacy' && offset > 0
      ? withPage({ offset: Math.max(0, offset - limit), cursor: undefined })
      : '',
  );

  function toggle(id: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onselectionchange(next);
  }

  function toggleAll() {
    onselectionchange(allSelected ? new Set() : new Set(groups.map((group) => group.id)));
  }

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  function handleShortcut(event: KeyboardEvent) {
    if (document.querySelector('dialog[open]')) return;
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      isTyping(event.target)
    ) {
      return;
    }
    if (event.key === 'ArrowRight' && nextHref) {
      event.preventDefault();
      rememberCursorPredecessor(nextHref);
      window.location.assign(nextHref);
    } else if (event.key === 'ArrowLeft') {
      if (previousHref) {
        event.preventDefault();
        window.location.assign(previousHref);
      } else if (paginationMode === 'inbox' && cursorPreviousHref) {
        event.preventDefault();
        window.location.assign(cursorPreviousHref);
      }
    }
  }

  function changePageSize(event: Event) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.set('limit', (event.target as HTMLSelectElement).value);
    if (paginationMode === 'inbox') params.set('queue', params.get('queue') ?? 'pending');
    params.delete('cursor');
    params.delete('offset');
    window.location.assign(`?${params.toString()}`);
  }
</script>

<svelte:window onkeydown={handleShortcut} />

<section
  aria-label="Keyboard shortcuts"
  class="border-soft text-muted flex flex-wrap gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs"
>
  <span class="text-ink font-medium">Keyboard shortcuts</span>
  <span><kbd>←</kbd> Previous page</span>
  <span><kbd>→</kbd> Next page</span>
</section>

{#if total > 0}
  <div class="border-soft overflow-x-auto rounded-lg border">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-soft bg-canvas border-b text-left">
          <th class="px-3 py-3">
            <input
              type="checkbox"
              checked={allSelected}
              onchange={toggleAll}
              aria-label="Select all groups on this page"
            />
          </th>
          <th class="text-muted px-3 py-3 font-medium">Primary Doc Title</th>
          <th class="text-muted hidden px-3 py-3 font-medium md:table-cell">Members</th>
          <th class="text-muted px-3 py-3 font-medium">Confidence</th>
          <th class="text-muted hidden px-3 py-3 font-medium sm:table-cell">Status</th>
          <th class="text-muted hidden px-3 py-3 font-medium lg:table-cell">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each groups as group, index (group.id)}
          <tr
            class="border-soft hover:bg-accent-subtle border-b {index % 2 === 0
              ? 'bg-surface'
              : 'bg-canvas'} {group.status === 'deleted' ? 'opacity-60' : ''}"
          >
            <td class="px-3 py-3">
              <input
                type="checkbox"
                checked={selectedIds.has(group.id)}
                onchange={() => toggle(group.id)}
                onclick={(event) => event.stopPropagation()}
                aria-label="Select {group.primaryDocumentTitle ?? 'untitled group'}"
              />
            </td>
            <td class="text-ink max-w-xs truncate px-3 py-3">
              <a
                href={detailHref(group.id)}
                class="text-accent hover:text-accent-hover rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {group.primaryDocumentTitle ?? 'Untitled'}
              </a>
            </td>
            <td class="hidden px-3 py-3 md:table-cell">
              {#if group.status === 'deleted'}
                <span class="text-muted">—</span>
              {:else}
                <button
                  onclick={(event) => {
                    event.stopPropagation();
                    onpreview(group);
                  }}
                  class="text-accent font-medium underline decoration-dotted"
                  title="Preview members"
                >
                  {group.memberCount}
                </button>
              {/if}
            </td>
            <td class="px-3 py-3">
              <RichTooltip position="left">
                <ConfidenceBadge score={group.confidenceScore} />
                {#snippet content()}
                  <ConfidenceTooltipContent
                    jaccardSimilarity={group.jaccardSimilarity}
                    fuzzyTextRatio={group.fuzzyTextRatio}
                    discriminativeScore={group.discriminativeScore}
                  />
                {/snippet}
              </RichTooltip>
            </td>
            <td class="hidden px-3 py-3 sm:table-cell"><StatusBadge status={group.status} /></td>
            <td class="text-muted hidden px-3 py-3 text-xs lg:table-cell">
              {new Date(group.updatedAt).toLocaleDateString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <nav class="flex flex-wrap items-center justify-between gap-4" aria-label="Duplicate pages">
    <span class="text-muted text-sm">
      {#if paginationMode === 'legacy'}
        Showing {offset + 1}-{Math.min(offset + groups.length, total)} of {total}
      {:else}
        {groups.length} on this page · {total} in this queue
      {/if}
    </span>
    <div class="flex items-center gap-2">
      {#if previousHref}
        <a
          href={previousHref}
          data-sveltekit-reload
          class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm"
        >
          Previous
        </a>
      {:else if paginationMode === 'inbox' && cursorPreviousHref}
        <a
          href={cursorPreviousHref}
          data-sveltekit-reload
          class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm"
        >
          Previous
        </a>
      {:else}
        <button
          disabled
          class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm opacity-50"
        >
          Previous
        </button>
      {/if}
      {#if nextHref}
        <a
          href={nextHref}
          data-sveltekit-reload
          onclick={() => rememberCursorPredecessor(nextHref)}
          class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm">Next</a
        >
      {:else}
        <button
          disabled
          class="border-soft text-ink rounded-lg border px-3 py-1.5 text-sm opacity-50"
        >
          Next
        </button>
      {/if}
      <label class="sr-only" for="duplicate-page-size">Groups per page</label>
      <select
        id="duplicate-page-size"
        onchange={changePageSize}
        value={String(limit)}
        class="border-soft bg-surface text-ink rounded-lg border px-2 py-1.5 text-sm"
      >
        <option value="10">10</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </div>
  </nav>
  {#if paginationMode === 'inbox' && cursorHistoryReady && $page.url.searchParams.has('cursor') && !cursorPreviousHref}
    <p class="text-muted text-right text-xs">Previous page is unavailable for this direct link.</p>
  {/if}
{:else}
  <div class="panel py-14 text-center">
    <p class="text-muted">
      {$page.url.search
        ? 'No groups match your filters.'
        : 'No duplicates found yet. Run analysis from the Dashboard.'}
    </p>
  </div>
{/if}
