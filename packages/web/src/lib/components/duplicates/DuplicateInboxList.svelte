<script lang="ts">
  import { type CompletedDeletionRun } from '@paperless-dedupe/core';
  import ConfidenceLegend from '../ui/ConfidenceLegend.svelte';
  import UndoDeletion from './UndoDeletion.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { browser } from '$app/env';
  import { page } from '$app/state';
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
    deletionRuns?: CompletedDeletionRun[];
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
    deletionRuns = [],
    total,
    limit,
    offset,
    paginationMode,
    nextCursor,
    selectedIds,
    onselectionchange,
    onpreview,
  }: Props = $props();

  const runByGroup = $derived(
    new SvelteMap(
      deletionRuns.flatMap((run) => run.groups.map((groupId) => [groupId, run] as const)),
    ),
  );
  const hasUndo = $derived(
    groups.some((group) => group.status === 'deleted' && runByGroup.has(group.id)),
  );

  let allSelected = $derived(groups.length > 0 && selectedIds.size === groups.length);
  let cursorPreviousHref = $state('');
  let cursorHistoryReady = $state(false);
  const CURSOR_HISTORY_KEY = 'paperless-dedupe:duplicate-cursor-predecessors';

  function currentRelativeUrl(): string {
    return `${page.url.pathname}${page.url.search}`;
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
    const url = new URL(href, page.url.href);
    return `${url.pathname}${url.search}`;
  }

  function detailHref(id: string): string {
    const returnParams = page.url.searchParams.toString();
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
    void page.url;
    cursorPreviousHref = readCursorHistory()[currentRelativeUrl()] ?? '';
    cursorHistoryReady = true;
  });

  function withPage(update: { cursor?: string; offset?: number; limit?: number }): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams(page.url.searchParams.toString());
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
    const params = new URLSearchParams(page.url.searchParams.toString());
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
  class="border-soft text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border px-3 py-2 text-xs"
>
  <span class="text-ink font-medium">Keyboard shortcuts</span>
  <span><kbd>←</kbd> Previous page</span>
  <span><kbd>→</kbd> Next page</span>
</section>

{#if total > 0}
  <div class="border-soft bg-surface border">
    <table class="w-full text-sm">
      <thead class="bg-surface sticky top-0 z-10">
        <tr class="border-b-border-hover border-b text-left">
          <th class="py-1.5 pr-3 pl-4">
            <input
              type="checkbox"
              checked={allSelected}
              onchange={toggleAll}
              aria-label="Select all groups on this page"
            />
          </th>
          <th class="label-micro px-3 py-1.5">Primary Doc Title</th>
          <th class="label-micro hidden px-3 py-1.5 md:table-cell">Members</th>
          <th class="label-micro px-3 py-1.5">Confidence</th>
          <th class="label-micro hidden px-3 py-1.5 sm:table-cell">Status</th>
          <th class="label-micro hidden px-3 py-1.5 lg:table-cell">Updated</th>
          {#if hasUndo}<th class="label-micro px-3 py-1.5">Restore</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each groups as group (group.id)}
          {@const run = runByGroup.get(group.id)}
          {@const selected = selectedIds.has(group.id)}
          <tr
            class="border-soft border-b last:border-b-0 {selected
              ? 'bg-selected'
              : 'hover:bg-canvas-deep'}"
          >
            <td
              class="h-9 py-1.5 pr-3 pl-4 {selected
                ? 'shadow-[inset_2px_0_0_var(--color-accent)]'
                : ''}"
            >
              <input
                type="checkbox"
                checked={selected}
                onchange={() => toggle(group.id)}
                onclick={(event) => event.stopPropagation()}
                aria-label="Select {group.primaryDocumentTitle ?? 'untitled group'}"
              />
            </td>
            <td class="text-ink w-full max-w-0 truncate px-3 py-1.5">
              <a
                href={detailHref(group.id)}
                class="text-accent hover:text-accent-hover rounded-sm font-medium underline-offset-2 hover:underline"
              >
                {group.primaryDocumentTitle ?? 'Untitled'}
              </a>
            </td>
            <td class="hidden px-3 py-1.5 md:table-cell">
              {#if group.status === 'deleted'}
                <span class="text-muted">—</span>
              {:else}
                <button
                  onclick={(event) => {
                    event.stopPropagation();
                    onpreview(group);
                  }}
                  class="text-accent font-mono tabular-nums underline decoration-dotted"
                  title="Preview members"
                >
                  {group.memberCount}
                </button>
              {/if}
            </td>
            <td class="px-3 py-1.5">
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
            <td class="hidden px-3 py-1.5 sm:table-cell"><StatusBadge status={group.status} /></td>
            <td class="text-muted hidden px-3 py-1.5 font-mono text-xs lg:table-cell">
              {new Date(group.updatedAt).toLocaleDateString()}
            </td>
            {#if hasUndo}<td class="px-3 py-1.5">
                {#if group.status === 'deleted' && run}
                  <UndoDeletion
                    run={{
                      planId: run.planId,
                      documentsDeleted: run.documentsDeleted,
                      groupCount: run.groups.length,
                    }}
                  />
                {/if}
              </td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-4">
    <ConfidenceLegend />
  </div>

  <nav class="flex flex-wrap items-center justify-between gap-4" aria-label="Duplicate pages">
    <span class="text-muted font-mono text-xs tabular-nums">
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
          class="border-border-hover text-ink-light hover:bg-canvas-deep inline-flex h-7 items-center rounded-sm border px-2.5 text-sm font-medium"
        >
          Previous
        </a>
      {:else if paginationMode === 'inbox' && cursorPreviousHref}
        <a
          href={cursorPreviousHref}
          data-sveltekit-reload
          class="border-border-hover text-ink-light hover:bg-canvas-deep inline-flex h-7 items-center rounded-sm border px-2.5 text-sm font-medium"
        >
          Previous
        </a>
      {:else}
        <button
          disabled
          class="border-border text-disabled inline-flex h-7 cursor-not-allowed items-center rounded-sm border px-2.5 text-sm font-medium"
        >
          Previous
        </button>
      {/if}
      {#if nextHref}
        <a
          href={nextHref}
          data-sveltekit-reload
          onclick={() => rememberCursorPredecessor(nextHref)}
          class="border-border-hover text-ink-light hover:bg-canvas-deep inline-flex h-7 items-center rounded-sm border px-2.5 text-sm font-medium"
        >
          Next
        </a>
      {:else}
        <button
          disabled
          class="border-border text-disabled inline-flex h-7 cursor-not-allowed items-center rounded-sm border px-2.5 text-sm font-medium"
        >
          Next
        </button>
      {/if}
      <label class="sr-only" for="duplicate-page-size">Groups per page</label>
      <select
        id="duplicate-page-size"
        onchange={changePageSize}
        value={String(limit)}
        class="border-border bg-surface-raised text-ink h-7 rounded-sm border px-2 font-mono text-sm"
      >
        <option value="10">10</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </div>
  </nav>
  {#if paginationMode === 'inbox' && cursorHistoryReady && page.url.searchParams.has('cursor') && !cursorPreviousHref}
    <p class="text-muted text-right text-xs">Previous page is unavailable for this direct link.</p>
  {/if}
{:else}
  <div class="panel py-14 text-center">
    <p class="text-muted">
      {page.url.search
        ? 'No groups match your filters.'
        : 'No duplicates found yet. Run analysis from the Dashboard.'}
    </p>
  </div>
{/if}
