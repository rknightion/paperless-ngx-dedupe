<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components';
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
    <Button variant="outline" size="sm" disabled={busy} onclick={() => load()}>Refresh</Button>
  </div>
  <p class="text-muted text-sm">
    These pairs were marked not duplicates. Removing a decision lets a later analysis reconsider the
    pair; it does not change Paperless documents.
  </p>
  {#if error}<p
      role="alert"
      class="border-ember text-ember border-l-2 py-1 pl-3 text-sm before:content-['●_']"
    >
      {error}
    </p>{/if}
  {#if notice}<p
      role="status"
      class="border-success text-success border-l-2 py-1 pl-3 text-sm before:content-['■_']"
    >
      {notice}
    </p>{/if}
  {#if items.length === 0 && !busy && !error}
    <p class="text-muted text-sm">No remembered decisions.</p>
  {/if}
  <ul class="divide-border divide-y">
    {#each items as item (item.id)}
      <li class="flex flex-wrap items-center justify-between gap-3 py-3">
        <div class="min-w-0 flex-1 space-y-1">
          {#each item.documents as doc (doc.paperlessId)}
            <p class="text-ink text-sm break-words">
              <span>{doc.title ?? 'Not in local library'}</span>
              <span class="text-muted font-mono text-xs">(#{doc.paperlessId})</span>
            </p>
          {/each}
          <p class="text-muted text-xs break-words">
            {item.source.replaceAll('_', ' ')} · {item.createdAt}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          ariaLabel={`Remove decision between ${item.documents[0].paperlessId} and ${item.documents[1].paperlessId}`}
          onclick={() => remove(item.id)}
        >
          Remove
        </Button>
      </li>
    {/each}
  </ul>
  {#if nextCursor}
    <Button variant="outline" size="sm" disabled={busy} onclick={() => load(true)}>
      Load more
    </Button>
  {/if}
</section>
