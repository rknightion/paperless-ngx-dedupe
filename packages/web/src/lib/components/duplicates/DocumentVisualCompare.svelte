<script lang="ts">
  import type { DuplicateGroupMember } from '@paperless-dedupe/core';

  interface Props {
    primary: DuplicateGroupMember;
    secondary: DuplicateGroupMember;
  }

  let { primary, secondary }: Props = $props();

  let showPdfPrimary = $state(false);
  let showPdfSecondary = $state(false);
  let thumbErrorPrimary = $state(false);
  let thumbErrorSecondary = $state(false);

  function thumbUrl(paperlessId: number): string {
    return `/api/v1/paperless/documents/${paperlessId}/thumb`;
  }

  function previewUrl(paperlessId: number): string {
    return `/api/v1/paperless/documents/${paperlessId}/preview`;
  }
</script>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Primary -->
  <div class="panel">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h4 class="text-ink text-sm font-semibold">Primary Document</h4>
        <span class="bg-accent-light text-accent rounded-full px-2 py-0.5 text-xs font-medium">
          Primary
        </span>
      </div>
      <button
        onclick={() => (showPdfPrimary = !showPdfPrimary)}
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1 text-xs font-medium"
      >
        {showPdfPrimary ? 'Show Thumbnail' : 'View PDF'}
      </button>
    </div>

    {#if showPdfPrimary}
      <iframe
        src={previewUrl(primary.paperlessId)}
        title="PDF preview: {primary.title}"
        class="border-soft h-[600px] w-full rounded-lg border"
      ></iframe>
    {:else if thumbErrorPrimary}
      <div
        class="border-soft bg-canvas text-muted flex h-48 items-center justify-center rounded-lg border text-sm"
      >
        Thumbnail unavailable
      </div>
    {:else}
      <img
        src={thumbUrl(primary.paperlessId)}
        alt="Thumbnail: {primary.title}"
        class="border-soft w-full rounded-lg border object-contain"
        onerror={() => (thumbErrorPrimary = true)}
      />
    {/if}

    <p class="text-muted mt-2 truncate text-xs">{primary.title}</p>
  </div>

  <!-- Secondary -->
  <div class="panel">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-ink text-sm font-semibold">Compared Document</h4>
      <button
        onclick={() => (showPdfSecondary = !showPdfSecondary)}
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-3 py-1 text-xs font-medium"
      >
        {showPdfSecondary ? 'Show Thumbnail' : 'View PDF'}
      </button>
    </div>

    {#if showPdfSecondary}
      <iframe
        src={previewUrl(secondary.paperlessId)}
        title="PDF preview: {secondary.title}"
        class="border-soft h-[600px] w-full rounded-lg border"
      ></iframe>
    {:else if thumbErrorSecondary}
      <div
        class="border-soft bg-canvas text-muted flex h-48 items-center justify-center rounded-lg border text-sm"
      >
        Thumbnail unavailable
      </div>
    {:else}
      <img
        src={thumbUrl(secondary.paperlessId)}
        alt="Thumbnail: {secondary.title}"
        class="border-soft w-full rounded-lg border object-contain"
        onerror={() => (thumbErrorSecondary = true)}
      />
    {/if}

    <p class="text-muted mt-2 truncate text-xs">{secondary.title}</p>
  </div>
</div>
