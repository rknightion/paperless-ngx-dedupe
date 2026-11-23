<script lang="ts">
  import { untrack } from 'svelte';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';

  interface Props {
    status: string | undefined;
    search: string | undefined;
    sort: string | undefined;
    groupBy: string | undefined;
    changedOnly: boolean | undefined;
    failed: boolean | undefined;
    minConfidence: number | undefined;
    model: string | undefined;
    onapply: (filters: Record<string, string | undefined>) => void;
  }

  let { status, search, sort, groupBy, changedOnly, failed, minConfidence, model, onapply }: Props =
    $props();

  // Local state copies (intentionally capture initial values only)
  const initial = untrack(() => ({
    status: status ?? '',
    search: search ?? '',
    sort: sort ?? '',
    groupBy: groupBy ?? '',
    changedOnly: changedOnly ?? false,
    failed: failed ?? false,
    minConfidence: minConfidence ?? 0,
    model: model ?? '',
  }));

  let localStatus = $state(initial.status);
  let localSearch = $state(initial.search);
  let localSort = $state(initial.sort);
  let localGroupBy = $state(initial.groupBy);
  let localChangedOnly = $state(initial.changedOnly);
  let localFailed = $state(initial.failed);
  let localMinConfidence = $state(initial.minConfidence);
  let localModel = $state(initial.model);
  let showAdvanced = $state(false);

  function emitFilters() {
    onapply({
      status: localStatus || undefined,
      search: localSearch || undefined,
      sort: localSort || undefined,
      groupBy: localGroupBy || undefined,
      changedOnly: localChangedOnly ? 'true' : undefined,
      failed: localFailed ? 'true' : undefined,
      minConfidence: localMinConfidence > 0 ? String(localMinConfidence) : undefined,
      model: localModel || undefined,
    });
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') emitFilters();
  }

  function handleSelectChange() {
    emitFilters();
  }

  const inputClass =
    'border-border bg-surface-raised text-ink placeholder:text-muted h-7 rounded-sm border px-2 text-sm';
  const selectClass =
    'border-border bg-surface-raised text-ink placeholder:text-muted h-7 rounded-sm border px-2 text-sm';
</script>

<div class="space-y-2">
  <!-- Primary row -->
  <div class="flex flex-wrap items-center gap-2">
    <select bind:value={localStatus} onchange={handleSelectChange} class={selectClass}>
      <option value="">All statuses</option>
      <option value="pending_review">Pending review</option>
      <option value="applied">Applied</option>
      <option value="partial">Partial</option>
      <option value="rejected">Rejected</option>
      <option value="failed">Failed</option>
      <option value="skipped">Skipped</option>
    </select>

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

    <select bind:value={localSort} onchange={handleSelectChange} class={selectClass}>
      <option value="">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="confidence_asc">Lowest confidence</option>
      <option value="confidence_desc">Highest confidence</option>
    </select>

    <select bind:value={localGroupBy} onchange={handleSelectChange} class={selectClass}>
      <option value="">No grouping</option>
      <option value="suggestedCorrespondent">By correspondent</option>
      <option value="suggestedDocumentType">By document type</option>
      <option value="confidenceBand">By confidence</option>
      <option value="failureType">By failure type</option>
    </select>

    <button
      onclick={() => (showAdvanced = !showAdvanced)}
      class="border-border text-muted hover:text-ink hover:bg-canvas-deep flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-sm font-medium transition-colors"
    >
      <SlidersHorizontalIcon class="h-3.5 w-3.5" />
      More filters
      {#if showAdvanced}
        <CaretUpIcon class="h-3.5 w-3.5" />
      {:else}
        <CaretDownIcon class="h-3.5 w-3.5" />
      {/if}
    </button>
  </div>

  <!-- Advanced filters -->
  {#if showAdvanced}
    <div class="border-border flex flex-wrap items-center gap-3 border-y py-2">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          bind:checked={localChangedOnly}
          onchange={handleSelectChange}
          class="accent-accent h-3.5 w-3.5"
        />
        <span class="text-ink">Changed only</span>
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          bind:checked={localFailed}
          onchange={handleSelectChange}
          class="accent-accent h-3.5 w-3.5"
        />
        <span class="text-ink">Failed only</span>
      </label>

      <div class="flex items-center gap-2">
        <label for="min-confidence" class="text-muted text-sm">Min confidence</label>
        <input
          id="min-confidence"
          type="number"
          min="0"
          max="100"
          step="5"
          bind:value={localMinConfidence}
          onchange={handleSelectChange}
          class="{inputClass} w-20"
        />
      </div>

      <input
        type="text"
        bind:value={localModel}
        placeholder="Model name..."
        onkeydown={handleSearchKeydown}
        class="{inputClass} w-40"
      />
    </div>
  {/if}
</div>
