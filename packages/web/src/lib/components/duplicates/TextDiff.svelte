<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    groupId: string;
    docAId: string;
    docBId: string;
    docAWordCount: number | null;
    docBWordCount: number | null;
    maxChars?: number;
  }

  let { groupId, docAId, docBId, docAWordCount, docBWordCount, maxChars = 10000 }: Props = $props();

  type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

  let loadState: LoadState = $state('idle');
  let textA: string | null = $state(null);
  let textB: string | null = $state(null);
  let errorMessage: string = $state('');
  let diffs: [number, string][] = $state([]);
  let showFull = $state(false);
  let containerRef: HTMLDivElement | undefined = $state();

  let truncatedA = $derived(textA ? textA.slice(0, showFull ? undefined : maxChars) : null);
  let truncatedB = $derived(textB ? textB.slice(0, showFull ? undefined : maxChars) : null);
  let isTruncated = $derived(
    (textA !== null && textA.length > maxChars) || (textB !== null && textB.length > maxChars),
  );

  let isIdentical = $derived(textA !== null && textB !== null && textA === textB);
  let bothNull = $derived(textA === null && textB === null);
  let oneNull = $derived((textA === null) !== (textB === null));
  let bothNoContent = $derived(docAWordCount === null && docBWordCount === null);

  async function fetchContent() {
    loadState = 'loading';
    try {
      const res = await fetch(
        `/api/v1/duplicates/${groupId}/content?docA=${encodeURIComponent(docAId)}&docB=${encodeURIComponent(docBId)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load content: ${res.status}`);
      }
      const json = await res.json();
      textA = json.data.docA.fullText;
      textB = json.data.docB.fullText;

      if (textA !== null && textB !== null && textA !== textB) {
        const { diff_match_patch } = await import('diff-match-patch');
        const dmp = new diff_match_patch();
        const result = dmp.diff_main(truncatedA ?? '', truncatedB ?? '');
        dmp.diff_cleanupSemantic(result);
        diffs = result;
      }

      loadState = 'loaded';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Unknown error';
      loadState = 'error';
    }
  }

  onMount(() => {
    if (bothNoContent) {
      loadState = 'loaded';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && loadState === 'idle') {
          fetchContent();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (containerRef) {
      observer.observe(containerRef);
    }

    return () => observer.disconnect();
  });

  $effect(() => {
    if (loadState !== 'loaded' || textA === null || textB === null || isIdentical) return;
    import('diff-match-patch').then(({ diff_match_patch }) => {
      const dmp = new diff_match_patch();
      const result = dmp.diff_main(truncatedA ?? '', truncatedB ?? '');
      dmp.diff_cleanupSemantic(result);
      diffs = result;
    });
  });
</script>

<div class="panel" bind:this={containerRef}>
  <h3 class="text-ink mb-3 text-base font-semibold">OCR Text Comparison</h3>

  {#if loadState === 'idle'}
    <p class="text-muted text-sm">Scroll down to load text comparison...</p>
  {:else if loadState === 'loading'}
    <p class="text-muted text-sm">Loading OCR text...</p>
  {:else if loadState === 'error'}
    <p class="text-ember text-sm">{errorMessage}</p>
  {:else if bothNull || bothNoContent}
    <p class="text-muted text-sm">No OCR text available for either document.</p>
  {:else if oneNull}
    <p class="text-muted text-sm">
      {textA === null ? 'Primary document' : 'Compared document'} has no OCR text available.
    </p>
  {:else if isIdentical}
    <div class="bg-success-light text-success rounded-lg p-3 text-sm">
      Text content is identical between both documents.
    </div>
  {:else}
    {#if isTruncated && !showFull}
      <p class="text-muted mb-2 text-xs">
        Text truncated to {maxChars.toLocaleString()} characters.
        <button
          onclick={() => {
            showFull = true;
          }}
          class="text-accent hover:text-accent-hover"
        >
          Show full text
        </button>
      </p>
    {/if}
    <pre
      class="bg-canvas max-h-96 overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">{#each diffs as [op, text], i (i)}{#if op === -1}<span
            class="bg-ember-light text-ember line-through">{text}</span
          >{:else if op === 1}<span class="bg-success-light text-success">{text}</span
          >{:else}{text}{/if}{/each}</pre>
  {/if}
</div>
