<script lang="ts">
  import { FileText } from 'lucide-svelte';

  interface Props {
    paperlessId: number;
    mode?: 'thumb' | 'preview';
  }

  let { paperlessId, mode = 'thumb' }: Props = $props();

  let loadState = $state<'loading' | 'loaded' | 'error'>('loading');

  const src = $derived(
    mode === 'thumb'
      ? `/api/v1/paperless/documents/${paperlessId}/thumb`
      : `/api/v1/paperless/documents/${paperlessId}/preview`,
  );

  // Reset load state when src changes
  $effect(() => {
    void src;
    loadState = 'loading';
  });
</script>

{#if mode === 'thumb'}
  <div class="relative aspect-[3/4] w-full">
    {#if loadState === 'loading'}
      <div class="bg-canvas-deep absolute inset-0 animate-pulse rounded-lg"></div>
    {/if}
    {#if loadState !== 'error'}
      <img
        {src}
        alt="Document thumbnail"
        class="h-full w-full rounded-lg object-cover"
        class:invisible={loadState === 'loading'}
        onload={() => (loadState = 'loaded')}
        onerror={() => (loadState = 'error')}
      />
    {:else}
      <div
        class="border-soft bg-canvas flex h-full w-full items-center justify-center rounded-lg border"
      >
        <FileText class="text-muted h-8 w-8" />
      </div>
    {/if}
  </div>
{:else}
  <div class="relative h-[400px] w-full">
    {#if loadState === 'loading'}
      <div class="bg-canvas-deep absolute inset-0 animate-pulse rounded-lg"></div>
    {/if}
    {#if loadState !== 'error'}
      <iframe
        {src}
        title="Document preview"
        class="border-soft w-full rounded-lg border"
        class:invisible={loadState === 'loading'}
        style="height: 400px;"
        onload={() => (loadState = 'loaded')}
        onerror={() => (loadState = 'error')}
      ></iframe>
    {:else}
      <div
        class="border-soft bg-canvas flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border"
      >
        <FileText class="text-muted h-8 w-8" />
        <p class="text-muted text-sm">Preview unavailable</p>
      </div>
    {/if}
  </div>
{/if}
