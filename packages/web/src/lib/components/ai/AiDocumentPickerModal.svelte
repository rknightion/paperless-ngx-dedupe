<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { Search, FileText, Loader2 } from 'lucide-svelte';

  interface DocumentSummary {
    id: string;
    paperlessId: number;
    title: string;
    correspondent: string | null;
    documentType: string | null;
    tags: string[];
    createdDate: string | null;
    addedDate: string | null;
    processingStatus: string | null;
  }

  interface Props {
    open: boolean;
    onsubmit: (documentIds: string[]) => void;
    oncancel: () => void;
  }

  let { open, onsubmit, oncancel }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let documents = $state<DocumentSummary[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let searchQuery = $state('');
  let loading = $state(false);
  const selectedIds = new SvelteSet<string>();
  const LIMIT = 20;

  const totalPages = $derived(Math.max(1, Math.ceil(total / LIMIT)));
  const currentPage = $derived(Math.floor(offset / LIMIT) + 1);
  const allOnPageSelected = $derived(
    documents.length > 0 && documents.every((d) => selectedIds.has(d.id)),
  );

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      offset = 0;
      searchQuery = '';
      selectedIds.clear();
      fetchDocuments();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  async function fetchDocuments() {
    loading = true;
    try {
      const queryParts = [`limit=${LIMIT}`, `offset=${offset}`];
      if (searchQuery.trim()) {
        queryParts.push(`search=${encodeURIComponent(searchQuery.trim())}`);
      }
      const res = await fetch(`/api/v1/documents?${queryParts.join('&')}`);
      if (!res.ok) throw new Error('Failed to fetch documents');
      const json = await res.json();
      documents = json.data ?? [];
      total = json.meta?.total ?? 0;
    } catch {
      documents = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      offset = 0;
      fetchDocuments();
    }
  }

  function handleSearchClick() {
    offset = 0;
    fetchDocuments();
  }

  function goToPage(page: number) {
    offset = (page - 1) * LIMIT;
    fetchDocuments();
  }

  function toggleDocument(id: string) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
  }

  function toggleAllOnPage() {
    if (allOnPageSelected) {
      for (const d of documents) {
        selectedIds.delete(d.id);
      }
    } else {
      for (const d of documents) {
        selectedIds.add(d.id);
      }
    }
  }

  function handleSubmit() {
    onsubmit(Array.from(selectedIds));
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
  class="border-soft bg-surface m-auto w-full max-w-3xl rounded-xl border p-0 shadow-lg backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-200"
  aria-labelledby="doc-picker-title"
>
  <div class="flex max-h-[80vh] flex-col">
    <!-- Header -->
    <div class="border-soft flex items-center justify-between border-b px-6 py-4">
      <h2 id="doc-picker-title" class="text-ink text-lg font-semibold">
        Select Documents to Process
      </h2>
      {#if selectedIds.size > 0}
        <span class="bg-accent-subtle text-accent rounded-full px-2.5 py-0.5 text-xs font-medium">
          {selectedIds.size} selected
        </span>
      {/if}
    </div>

    <!-- Search bar -->
    <div class="border-soft border-b px-6 py-3">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search
            class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
          />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search by document title..."
            onkeydown={handleSearchKeydown}
            class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent w-full rounded-lg border py-2 pr-3 pl-8 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
        <button
          onclick={handleSearchClick}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </div>
    </div>

    <!-- Select all banner -->
    {#if allOnPageSelected && total > LIMIT}
      <div
        class="bg-accent-subtle border-soft flex items-center justify-center gap-2 border-b px-6 py-2 text-sm"
      >
        <span class="text-ink">All {documents.length} documents on this page are selected.</span>
        <span class="text-muted">
          {selectedIds.size} of {total} total documents selected.
        </span>
      </div>
    {/if}

    <!-- Table -->
    <div class="flex-1 overflow-auto">
      {#if loading}
        <div class="flex items-center justify-center py-16">
          <Loader2 class="text-muted h-6 w-6 animate-spin" />
        </div>
      {:else if documents.length === 0}
        <div class="flex flex-col items-center py-16 text-center">
          <div class="bg-accent-subtle mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <FileText class="text-accent h-7 w-7" />
          </div>
          <p class="text-ink text-base font-medium">No documents found</p>
          <p class="text-muted mt-2 text-sm">Try adjusting your search query.</p>
        </div>
      {:else}
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-soft bg-canvas/60 border-b">
              <th class="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onchange={toggleAllOnPage}
                  class="rounded"
                />
              </th>
              <th class="text-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">Title</th
              >
              <th
                class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
                >Correspondent</th
              >
              <th
                class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase md:table-cell"
                >Document Type</th
              >
              <th
                class="text-muted hidden px-4 py-3 text-xs font-medium tracking-wide uppercase lg:table-cell"
                >Tags</th
              >
            </tr>
          </thead>
          <tbody>
            {#each documents as doc (doc.id)}
              <tr
                class="border-soft hover:bg-canvas/40 cursor-pointer border-b transition-colors"
                class:bg-accent-subtle={selectedIds.has(doc.id)}
                onclick={() => toggleDocument(doc.id)}
              >
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onchange={() => toggleDocument(doc.id)}
                    onclick={(e) => e.stopPropagation()}
                    class="rounded"
                  />
                </td>
                <td class="text-ink max-w-[200px] truncate px-4 py-3 font-medium">{doc.title}</td>
                <td class="text-muted hidden px-4 py-3 md:table-cell">{doc.correspondent ?? '—'}</td
                >
                <td class="text-muted hidden px-4 py-3 md:table-cell">{doc.documentType ?? '—'}</td>
                <td class="text-muted hidden max-w-[180px] truncate px-4 py-3 lg:table-cell">
                  {doc.tags.length > 0 ? doc.tags.join(', ') : '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="border-soft flex items-center justify-between border-t px-6 py-3">
        <span class="text-muted text-sm">
          Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
        </span>
        <div class="flex items-center gap-1">
          <button
            onclick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            class="border-soft text-muted hover:text-ink disabled:text-muted/50 rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span class="text-muted px-2 text-sm">Page {currentPage} of {totalPages}</span>
          <button
            onclick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            class="border-soft text-muted hover:text-ink disabled:text-muted/50 rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    {/if}

    <!-- Footer -->
    <div class="border-soft flex items-center justify-between border-t px-6 py-4">
      <span class="text-muted text-sm">
        {#if selectedIds.size > 0}
          {selectedIds.size} document{selectedIds.size === 1 ? '' : 's'} selected
        {:else}
          No documents selected
        {/if}
      </span>
      <div class="flex items-center gap-3">
        <button
          onclick={oncancel}
          class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onclick={handleSubmit}
          disabled={selectedIds.size === 0}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Process {selectedIds.size} Document{selectedIds.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  </div>
</dialog>
