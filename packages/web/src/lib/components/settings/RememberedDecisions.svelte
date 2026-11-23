<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteURLSearchParams } from 'svelte/reactivity';

  interface Decision {
    id: string;
    source: string;
    createdAt: string;
    documents: { paperlessId: number; title: string | null }[];
  }
  let items = $state<Decision[]>([]);
  let total = $state(0);
  let nextCursor = $state<string | null>(null);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');

  async function load(append = false) {
    busy = true;
    error = '';
    try {
      const query = new SvelteURLSearchParams({ limit: '20' });
      if (append && nextCursor) query.set('cursor', nextCursor);
      const response = await fetch(`/api/v1/duplicates/pair-decisions?${query}`);
      if (!response.ok) throw new Error('load');
      const result = await response.json();
      items = append ? [...items, ...result.data] : result.data;
      total = result.meta.total;
      nextCursor = result.meta.nextCursor;
    } catch {
      error = 'Could not load decisions. Refresh to try again.';
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    busy = true;
    error = '';
    notice = '';
    try {
      const response = await fetch(`/api/v1/duplicates/pair-decisions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        error =
          response.status === 409
            ? 'Another duplicate operation is running. Try removing this decision again when it finishes.'
            : 'Could not remove this decision. Try again.';
        return;
      }
      notice = 'Decision removed. Run analysis again to reconsider this pair.';
      await load();
    } catch {
      error = 'Could not remove this decision. Try again.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<section class="panel mt-6 space-y-4" aria-label="Remembered decisions" aria-busy={busy}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-ink text-lg font-semibold">Remembered decisions ({total})</h2>
    <button
      type="button"
      class="border-soft bg-surface text-ink rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
      disabled={busy}
      onclick={() => load()}
    >
      Refresh
    </button>
  </div>
  <p class="text-muted text-sm">
    These pairs were marked not duplicates. Removing a decision lets a later analysis reconsider the
    pair; it does not change Paperless documents.
  </p>
  {#if error}<p role="alert" class="text-ember text-sm">{error}</p>{/if}
  {#if notice}<p role="status" class="text-success text-sm">{notice}</p>{/if}
  {#if items.length === 0 && !busy && !error}
    <p class="text-muted text-sm">No remembered decisions.</p>
  {/if}
  <ul class="divide-soft divide-y">
    {#each items as item (item.id)}
      <li class="flex flex-wrap items-center justify-between gap-3 py-3">
        <div class="min-w-0 flex-1 space-y-1">
          {#each item.documents as doc (doc.paperlessId)}
            <p class="text-ink text-sm break-words">
              <span>{doc.title ?? 'Not in local library'}</span>
              <span class="text-muted">(#{doc.paperlessId})</span>
            </p>
          {/each}
          <p class="text-muted text-xs break-words">
            {item.source.replaceAll('_', ' ')} · {item.createdAt}
          </p>
        </div>
        <button
          type="button"
          class="border-soft bg-surface text-ink rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          aria-label={`Remove decision between ${item.documents[0].paperlessId} and ${item.documents[1].paperlessId}`}
          onclick={() => remove(item.id)}
        >
          Remove
        </button>
      </li>
    {/each}
  </ul>
  {#if nextCursor}
    <button
      type="button"
      class="border-soft bg-surface text-ink rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
      disabled={busy}
      onclick={() => load(true)}
    >
      Load more
    </button>
  {/if}
</section>
