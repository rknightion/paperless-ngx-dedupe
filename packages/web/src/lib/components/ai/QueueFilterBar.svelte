<script lang="ts">
  import { untrack } from 'svelte';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import ShuffleIcon from 'phosphor-svelte/lib/ShuffleIcon';

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
    'border-border bg-surface-raised text-ink placeholder:text-muted h-7 rounded-sm border px-2 text-sm';
</script>

<div class="border-border flex flex-wrap items-center gap-2 border-y py-2">
  <div class="relative">
    <MagnifyingGlassIcon
      class="text-muted pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2"
    />
    <input
      type="text"
      bind:value={localSearch}
      placeholder="Search documents..."
      onkeydown={handleSearchKeydown}
      class="border-border bg-surface-raised text-ink placeholder:text-muted h-7 rounded-sm border px-2 pl-7 text-sm"
    />
  </div>

  <select
    aria-label="Sort documents"
    bind:value={localSort}
    onchange={handleSelectChange}
    class={selectClass}
  >
    <option value="">Newest</option>
    <option value="oldest">Oldest</option>
    <option value="title_asc">Title A→Z</option>
    <option value="title_desc">Title Z→A</option>
    <option value="random">Shuffle</option>
  </select>

  {#if localSort === 'random'}
    <button
      onclick={handleReshuffle}
      class="border-border text-muted hover:text-ink hover:bg-canvas-deep flex h-7 items-center gap-1.5 rounded-sm border px-2 text-sm transition-colors"
      title="Re-shuffle"
    >
      <ShuffleIcon class="h-3.5 w-3.5" />
    </button>
  {/if}

  {#if correspondents.length > 0}
    <select
      aria-label="Correspondent"
      bind:value={localCorrespondent}
      onchange={handleSelectChange}
      class={selectClass}
    >
      <option value="">All correspondents</option>
      {#each correspondents as c (c)}
        <option value={c}>{c}</option>
      {/each}
    </select>
  {/if}

  {#if documentTypes.length > 0}
    <select
      aria-label="Document type"
      bind:value={localDocumentType}
      onchange={handleSelectChange}
      class={selectClass}
    >
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
    class="border-border bg-surface-raised text-ink placeholder:text-muted h-7 w-36 rounded-sm border px-2 text-sm"
  />
</div>
