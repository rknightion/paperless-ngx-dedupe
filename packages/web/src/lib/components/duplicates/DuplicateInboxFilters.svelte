<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowDown, ArrowUp } from 'lucide-svelte';

  interface Props {
    paginationMode: 'inbox' | 'legacy';
    queue?: string;
  }

  let { paginationMode, queue = 'pending' }: Props = $props();
  let correspondent = $derived($page.url.searchParams.get('correspondent') ?? '');
  let sortOrder = $derived($page.url.searchParams.get('sortOrder') ?? 'desc');

  function navigate(updates: Record<string, string>, mode: 'inbox' | 'legacy') {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    if (mode === 'inbox') {
      params.set('queue', params.get('queue') ?? queue);
      for (const key of ['status', 'includeDeleted', 'sortBy', 'sortOrder']) params.delete(key);
    } else {
      params.delete('queue');
      params.delete('correspondent');
    }
    params.delete('cursor');
    params.delete('offset');
    window.location.assign(`?${params.toString()}`);
  }

  function confidenceValue(key: string): string {
    const value = $page.url.searchParams.get(key);
    return value ? String(Math.round(Number(value) * 100)) : '';
  }

  function modeSwitchHref(mode: 'inbox' | 'legacy'): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams($page.url.searchParams);
    params.delete('cursor');
    params.delete('offset');
    if (mode === 'legacy') {
      params.delete('queue');
      params.delete('correspondent');
      params.set('status', 'pending');
    } else {
      params.delete('status');
      params.delete('includeDeleted');
      params.delete('sortBy');
      params.delete('sortOrder');
      params.set('queue', 'pending');
    }
    return `?${params.toString()}`;
  }
</script>

<section class="panel space-y-4" aria-label="Duplicate inbox filters">
  {#if paginationMode === 'inbox'}
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-ink text-sm font-semibold">Review inbox</h2>
        <p class="text-muted text-xs">
          Queue and correspondent filters apply to the review dataset.
        </p>
      </div>
      <a
        href={modeSwitchHref('legacy')}
        data-sveltekit-reload
        class="border-soft text-ink rounded-lg border px-3 py-2 text-sm font-medium"
      >
        Use legacy list
      </a>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label for="review-queue" class="text-ink block text-sm font-medium">Review queue</label>
        <select
          id="review-queue"
          value={queue}
          oninput={(event) =>
            navigate({ queue: (event.target as HTMLSelectElement).value }, 'inbox')}
          class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="high-confidence">High confidence</option>
          <option value="ambiguous">Ambiguous</option>
          <option value="ignored">Ignored</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <form
        onsubmit={(event) => {
          event.preventDefault();
          navigate({ correspondent: correspondent.trim() }, 'inbox');
        }}
      >
        <label for="correspondent-filter" class="text-ink block text-sm font-medium">
          Correspondent
        </label>
        <input
          id="correspondent-filter"
          bind:value={correspondent}
          placeholder="Any correspondent"
          class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
      </form>
      {@render ConfidenceInput('min-confidence', 'Min confidence', 'minConfidence')}
      {@render ConfidenceInput('max-confidence', 'Max confidence', 'maxConfidence')}
    </div>
  {:else}
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-ink text-sm font-semibold">Legacy list</h2>
        <p class="text-muted text-xs">
          Status and sort controls apply to the complete legacy list.
        </p>
      </div>
      <a
        href={modeSwitchHref('inbox')}
        data-sveltekit-reload
        class="border-soft text-ink rounded-lg border px-3 py-2 text-sm font-medium"
      >
        Use review inbox
      </a>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <label for="status-filter" class="text-ink block text-sm font-medium">Status</label>
        <select
          id="status-filter"
          value={$page.url.searchParams.get('status') ?? 'all'}
          onchange={(event) => {
            const value = (event.target as HTMLSelectElement).value;
            navigate({ status: value === 'all' ? '' : value }, 'legacy');
          }}
          class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="false_positive">False Positive</option>
          <option value="ignored">Ignored</option>
        </select>
      </div>
      {@render ConfidenceInput('min-confidence', 'Min confidence', 'minConfidence')}
      {@render ConfidenceInput('max-confidence', 'Max confidence', 'maxConfidence')}
      <div>
        <label for="sort-by" class="text-ink block text-sm font-medium">Sort by</label>
        <div class="mt-1 flex gap-1">
          <select
            id="sort-by"
            value={$page.url.searchParams.get('sortBy') ?? 'confidence'}
            onchange={(event) =>
              navigate({ sortBy: (event.target as HTMLSelectElement).value }, 'legacy')}
            class="border-soft bg-surface text-ink min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          >
            <option value="confidence">Confidence</option>
            <option value="created_at">Created</option>
            <option value="member_count">Members</option>
            <option value="status">Status</option>
            <option value="updated_at">Updated</option>
          </select>
          <button
            type="button"
            onclick={() => navigate({ sortOrder: sortOrder === 'desc' ? 'asc' : 'desc' }, 'legacy')}
            aria-label="Toggle sort order"
            class="border-soft text-ink rounded-lg border px-2"
          >
            {#if sortOrder === 'desc'}<ArrowDown class="h-4 w-4" />{:else}<ArrowUp
                class="h-4 w-4"
              />{/if}
          </button>
        </div>
      </div>
      <label class="text-ink flex items-center gap-2 self-end py-2 text-sm">
        <input
          type="checkbox"
          checked={$page.url.searchParams.get('includeDeleted') === 'true'}
          onchange={(event) =>
            navigate(
              { includeDeleted: (event.target as HTMLInputElement).checked ? 'true' : '' },
              'legacy',
            )}
        />
        Show deleted
      </label>
    </div>
  {/if}
</section>

{#snippet ConfidenceInput(id: string, label: string, keyName: string)}
  <div>
    <label for={id} class="text-ink block text-sm font-medium">{label}</label>
    <input
      {id}
      type="number"
      min="0"
      max="100"
      placeholder={keyName === 'minConfidence' ? '0' : '100'}
      value={confidenceValue(keyName)}
      onchange={(event) => {
        const value = (event.target as HTMLInputElement).value;
        navigate({ [keyName]: value ? String(Number(value) / 100) : '' }, paginationMode);
      }}
      class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm"
    />
  </div>
{/snippet}
