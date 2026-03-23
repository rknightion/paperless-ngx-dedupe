<script lang="ts">
  import { FileText } from 'lucide-svelte';

  interface Props {
    paperlessId: number | null;
    alt: string;
    size?: 'sm' | 'md';
  }

  let { paperlessId, alt, size = 'sm' }: Props = $props();

  let hasError = $state(false);
  let hovered = $state(false);

  const dimensions = $derived(
    size === 'sm' ? { width: 40, height: 56 } : { width: 64, height: 90 },
  );

  function thumbUrl(id: number): string {
    return `/api/v1/paperless/documents/${id}/thumb`;
  }
</script>

<span
  class="relative inline-flex shrink-0"
  role="img"
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
>
  {#if paperlessId && !hasError}
    <img
      src={thumbUrl(paperlessId)}
      {alt}
      width={dimensions.width}
      height={dimensions.height}
      class="border-soft rounded border object-cover"
      style="width: {dimensions.width}px; height: {dimensions.height}px;"
      loading="lazy"
      onerror={() => (hasError = true)}
    />
  {:else}
    <div
      class="border-soft bg-canvas text-muted flex items-center justify-center rounded border"
      style="width: {dimensions.width}px; height: {dimensions.height}px;"
    >
      <FileText class="h-4 w-4" />
    </div>
  {/if}

  <!-- Hover-to-enlarge popover -->
  {#if hovered && paperlessId && !hasError}
    <div
      class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2"
      role="tooltip"
    >
      <img
        src={thumbUrl(paperlessId)}
        alt="{alt} (enlarged)"
        class="border-soft bg-surface h-auto w-[500px] max-w-none rounded-lg border shadow-lg"
      />
      <div class="bg-ink absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45"></div>
    </div>
  {/if}
</span>
