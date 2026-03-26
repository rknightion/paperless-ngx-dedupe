<script lang="ts">
  import type { AiResultSummary } from '@paperless-dedupe/core';
  import {
    selectNextResult,
    selectPrevResult,
    getActiveResultId,
    toggleField,
    closeDetail,
  } from './AiReviewStore.svelte';

  interface Props {
    results: AiResultSummary[];
    onapply: (id: string) => Promise<void>;
    onreject: (id: string) => Promise<void>;
    searchInputRef: HTMLInputElement | null;
  }

  let { results, onapply, onreject, searchInputRef }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    // Skip if focus is in an input, textarea, select, or contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }

    switch (e.key) {
      case 'j':
        e.preventDefault();
        selectNextResult(results);
        break;
      case 'k':
        e.preventDefault();
        selectPrevResult(results);
        break;
      case 'a': {
        e.preventDefault();
        const id = getActiveResultId();
        if (id) onapply(id);
        break;
      }
      case 'r': {
        e.preventDefault();
        const id = getActiveResultId();
        if (id) onreject(id);
        break;
      }
      case '1':
        e.preventDefault();
        {
          const id = getActiveResultId();
          if (id) toggleField(id, 'correspondent');
        }
        break;
      case '2':
        e.preventDefault();
        {
          const id = getActiveResultId();
          if (id) toggleField(id, 'documentType');
        }
        break;
      case '3':
        e.preventDefault();
        {
          const id = getActiveResultId();
          if (id) toggleField(id, 'tags');
        }
        break;
      case '/':
        e.preventDefault();
        searchInputRef?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        closeDetail();
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
