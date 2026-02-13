<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    textA: string | null;
    textB: string | null;
    maxChars?: number;
  }

  let { textA, textB, maxChars = 10000 }: Props = $props();

  let diffs: [number, string][] = $state([]);
  let isLoaded = $state(false);
  let showFull = $state(false);

  let truncatedA = $derived(textA ? textA.slice(0, showFull ? undefined : maxChars) : null);
  let truncatedB = $derived(textB ? textB.slice(0, showFull ? undefined : maxChars) : null);
  let isTruncated = $derived(
    (textA !== null && textA.length > maxChars) ||
    (textB !== null && textB.length > maxChars),
  );

  let isIdentical = $derived(textA !== null && textB !== null && textA === textB);
  let bothNull = $derived(textA === null && textB === null);
  let oneNull = $derived((textA === null) !== (textB === null));

  onMount(async () => {
    if (textA === null || textB === null || isIdentical) {
      isLoaded = true;
      return;
    }
    const { diff_match_patch } = await import('diff-match-patch');
    const dmp = new diff_match_patch();
    const result = dmp.diff_main(truncatedA ?? '', truncatedB ?? '');
    dmp.diff_cleanupSemantic(result);
    diffs = result;
    isLoaded = true;
  });

  $effect(() => {
    if (!isLoaded || textA === null || textB === null || isIdentical) return;
    // Re-compute when showFull changes
    import('diff-match-patch').then(({ diff_match_patch }) => {
      const dmp = new diff_match_patch();
      const result = dmp.diff_main(truncatedA ?? '', truncatedB ?? '');
      dmp.diff_cleanupSemantic(result);
      diffs = result;
    });
  });
</script>

<div class="panel">
  <h3 class="mb-3 text-base font-semibold text-ink">OCR Text Comparison</h3>

  {#if bothNull}
    <p class="text-sm text-muted">No OCR text available for either document.</p>
  {:else if oneNull}
    <p class="text-sm text-muted">
      {textA === null ? 'Primary document' : 'Compared document'} has no OCR text available.
    </p>
  {:else if isIdentical}
    <div class="rounded-lg bg-success-light p-3 text-sm text-success">
      Text content is identical between both documents.
    </div>
  {:else if !isLoaded}
    <p class="text-sm text-muted">Computing differences...</p>
  {:else}
    {#if isTruncated && !showFull}
      <p class="mb-2 text-xs text-muted">
        Text truncated to {maxChars.toLocaleString()} characters.
        <button onclick={() => { showFull = true; }} class="text-accent hover:text-accent-hover">
          Show full text
        </button>
      </p>
    {/if}
    <pre class="max-h-96 overflow-auto rounded-lg bg-canvas p-4 font-mono text-xs leading-relaxed">{#each diffs as [op, text]}{#if op === -1}<span class="bg-ember-light text-ember line-through">{text}</span>{:else if op === 1}<span class="bg-success-light text-success">{text}</span>{:else}{text}{/if}{/each}</pre>
  {/if}
</div>
