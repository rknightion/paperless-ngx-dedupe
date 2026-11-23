<script lang="ts">
  import { type DuplicateGroupMember } from '@paperless-dedupe/core';
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';

  interface Props {
    primary: DuplicateGroupMember;
    secondary: DuplicateGroupMember;
    primaryMedia: { thumbnailUrl: string; previewUrl: string };
    secondaryMedia: { thumbnailUrl: string; previewUrl: string };
    secondaryIndex?: number;
    secondaryCount?: number;
    onnavigate?: (index: number) => void;
  }

  let {
    primary,
    secondary,
    primaryMedia,
    secondaryMedia,
    secondaryIndex = 0,
    secondaryCount = 1,
    onnavigate,
  }: Props = $props();

  const hasPrev = $derived(secondaryIndex > 0);
  const hasNext = $derived(secondaryIndex < secondaryCount - 1);

  let showPdfPrimary = $state(false);
  let showPdfSecondary = $state(false);
  let thumbErrorPrimary = $state(false);
  let thumbErrorSecondary = $state(false);
</script>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Primary -->
  <div class="panel min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h4 class="text-ink text-lg font-semibold">Primary Document</h4>
        <span class="status-word text-ink uppercase">
          <span aria-hidden="true">&#9632;</span>
          <span>Primary</span>
        </span>
      </div>
      <button
        onclick={() => (showPdfPrimary = !showPdfPrimary)}
        class="border-border-hover text-ink-light hover:bg-canvas-deep h-[26px] rounded-sm border px-2.5 text-xs font-medium max-md:h-8"
      >
        {showPdfPrimary ? 'Show Thumbnail' : 'View PDF'}
      </button>
    </div>

    {#if showPdfPrimary}
      <iframe
        src={primaryMedia.previewUrl}
        title="PDF preview: {primary.title}"
        class="border-soft h-[600px] w-full border"
      ></iframe>
    {:else if thumbErrorPrimary}
      <div
        class="border-soft bg-canvas text-muted flex h-48 items-center justify-center border text-sm"
      >
        Thumbnail unavailable
      </div>
    {:else}
      <img
        src={primaryMedia.thumbnailUrl}
        alt="Thumbnail: {primary.title}"
        class="border-soft max-h-[600px] w-full border object-contain"
        onerror={() => (thumbErrorPrimary = true)}
      />
    {/if}

    <p class="text-muted mt-2 truncate text-xs">{primary.title}</p>
  </div>

  <!-- Secondary -->
  <div class="panel min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h4 class="text-ink text-lg font-semibold">Compared Document</h4>
        {#if secondaryCount > 1}
          <span class="text-muted font-mono text-xs tabular-nums">
            {secondaryIndex + 1}/{secondaryCount}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if secondaryCount > 1 && onnavigate}
          <button
            onclick={() => onnavigate(secondaryIndex - 1)}
            disabled={!hasPrev}
            class="border-border-hover text-ink-light hover:bg-canvas-deep disabled:text-disabled disabled:border-border inline-flex h-[26px] w-[26px] items-center justify-center rounded-sm border disabled:cursor-not-allowed max-md:size-8"
            title="Previous document"
          >
            <CaretLeftIcon class="h-4 w-4" />
          </button>
          <button
            onclick={() => onnavigate(secondaryIndex + 1)}
            disabled={!hasNext}
            class="border-border-hover text-ink-light hover:bg-canvas-deep disabled:text-disabled disabled:border-border inline-flex h-[26px] w-[26px] items-center justify-center rounded-sm border disabled:cursor-not-allowed max-md:size-8"
            title="Next document"
          >
            <CaretRightIcon class="h-4 w-4" />
          </button>
        {/if}
        <button
          onclick={() => (showPdfSecondary = !showPdfSecondary)}
          class="border-border-hover text-ink-light hover:bg-canvas-deep h-[26px] rounded-sm border px-2.5 text-xs font-medium max-md:h-8"
        >
          {showPdfSecondary ? 'Show Thumbnail' : 'View PDF'}
        </button>
      </div>
    </div>

    {#if showPdfSecondary}
      <iframe
        src={secondaryMedia.previewUrl}
        title="PDF preview: {secondary.title}"
        class="border-soft h-[600px] w-full border"
      ></iframe>
    {:else if thumbErrorSecondary}
      <div
        class="border-soft bg-canvas text-muted flex h-48 items-center justify-center border text-sm"
      >
        Thumbnail unavailable
      </div>
    {:else}
      <img
        src={secondaryMedia.thumbnailUrl}
        alt="Thumbnail: {secondary.title}"
        class="border-soft max-h-[600px] w-full border object-contain"
        onerror={() => (thumbErrorSecondary = true)}
      />
    {/if}

    <p class="text-muted mt-2 truncate text-xs">{secondary.title}</p>
  </div>
</div>
