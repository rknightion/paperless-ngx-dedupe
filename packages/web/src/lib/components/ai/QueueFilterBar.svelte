<script lang="ts">
  import { untrack } from 'svelte';
  import { Search, Shuffle } from 'lucide-svelte';

  interface Props {
    search: string | undefined;
    sort: string | undefined;
    correspondent: string | undefined;
    documentType: string | undefined;
    tag: string | undefined;
    seed: number | undefined;
    correspondents: string[];
    documentTypes: string[];
    onapply: (filters: Record<string, string | undefined>) => void;
  }

  let {
    search,
    sort,
    correspondent,
    documentType,
    tag,
    seed,
    correspondents,
    documentTypes,
    onapply,
  }: Props = $props();

  const initial = untrack(() => ({
    search: search ?? '',
    sort: sort ?? '',
    correspondent: correspondent ?? '',
    documentType: documentType ?? '',
    tag: tag ?? '',
    seed: seed ?? 0,
  }));

  let localSearch = $state(initial.search);
  let localSort = $state(initial.sort);
  let localCorrespondent = $state(initial.correspondent);
  let localDocumentType = $state(initial.documentType);
  let localTag = $state(initial.tag);
  let localSeed = $state(initial.seed);

  function generateSeed(): number {
    return Math.floor(Math.random() * 2147483646) + 1;
  }

  function emitFilters() {
    const effectiveSeed = localSort === 'random' ? localSeed || generateSeed() : undefined;
    if (localSort === 'random' && !localSeed) {
      localSeed = effectiveSeed!;
    }
    onapply({
      search: localSearch || undefined,
      sort: localSort || undefined,
      correspondent: localCorrespondent || undefined,
      documentType: localDocumentType || undefined,
      tag: localTag || undefined,
      seed: effectiveSeed ? String(effectiveSeed) : undefined,
    });
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') emitFilters();
  }

  function handleSelectChange() {
    emitFilters();
  }

  function handleReshuffle() {
    localSeed = generateSeed();
    emitFilters();
  }

  const selectClass =
    'border-soft bg-surface text-ink focus:border-accent focus:ring-accent rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none';
</script>

<div class="flex flex-wrap items-center gap-2">
  <div class="relative">
    <Search
      class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
    />
    <input
      type="text"
      bind:value={localSearch}
      placeholder="Search documents..."
      onkeydown={handleSearchKeydown}
      class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent rounded-lg border py-2 pr-3 pl-8 text-sm focus:ring-1 focus:outline-none"
    />
  </div>

  <select bind:value={localSort} onchange={handleSelectChange} class={selectClass}>
    <option value="">Newest</option>
    <option value="oldest">Oldest</option>
    <option value="title_asc">Title A→Z</option>
    <option value="title_desc">Title Z→A</option>
    <option value="random">Shuffle</option>
  </select>

  {#if localSort === 'random'}
    <button
      onclick={handleReshuffle}
      class="border-soft text-muted hover:text-ink hover:bg-canvas flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition-colors"
      title="Re-shuffle"
    >
      <Shuffle class="h-3.5 w-3.5" />
    </button>
  {/if}

  {#if correspondents.length > 0}
    <select bind:value={localCorrespondent} onchange={handleSelectChange} class={selectClass}>
      <option value="">All correspondents</option>
      {#each correspondents as c (c)}
        <option value={c}>{c}</option>
      {/each}
    </select>
  {/if}

  {#if documentTypes.length > 0}
    <select bind:value={localDocumentType} onchange={handleSelectChange} class={selectClass}>
      <option value="">All types</option>
      {#each documentTypes as dt (dt)}
        <option value={dt}>{dt}</option>
      {/each}
    </select>
  {/if}

  <input
    type="text"
    bind:value={localTag}
    placeholder="Filter by tag..."
    onkeydown={handleSearchKeydown}
    class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent w-36 rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
  />
</div>
