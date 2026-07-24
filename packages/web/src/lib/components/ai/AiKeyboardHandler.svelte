<script lang="ts">
  import type { AiFieldSelection, AiResultSummary } from '@paperless-dedupe/core';
  import { isAiKeyboardActionAllowed, shouldIgnoreAiShortcutTarget } from './ai-keyboard';
  import {
    selectNextResult,
    selectPrevResult,
    getActiveResultId,
    toggleField,
    closeDetail,
    fieldSelections,
  } from './AiReviewStore.svelte';

  interface Props {
    results: AiResultSummary[];
    onapply: (id: string, selection: AiFieldSelection) => Promise<void>;
    onreject: (id: string) => Promise<void>;
    searchInputRef: HTMLInputElement | null;
  }

  let { results, onapply, onreject, searchInputRef }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    // Skip if focus is in an input, textarea, select, or contenteditable
    const target = e.target as HTMLElement;
    if (shouldIgnoreAiShortcutTarget(target)) {
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
        const id = getActiveResultId();
        const result = results.find((item) => item.id === id);
        const selection = id ? fieldSelections.get(id) : null;
        if (
          id &&
          isAiKeyboardActionAllowed(result, 'apply') &&
          selection &&
          (selection.title ||
            selection.correspondent ||
            selection.documentType ||
            selection.tags ||
            selection.processedTag ||
            selection.customFieldIds.length > 0)
        ) {
          e.preventDefault();
          onapply(id, selection);
        }
        break;
      }
      case 'r': {
        const id = getActiveResultId();
        const result = results.find((item) => item.id === id);
        if (id && isAiKeyboardActionAllowed(result, 'reject')) {
          e.preventDefault();
          onreject(id);
        }
        break;
      }
      case '1':
        {
          const id = getActiveResultId();
          const result = results.find((item) => item.id === id);
          if (id && isAiKeyboardActionAllowed(result, 'toggle-field')) {
            e.preventDefault();
            toggleField(id, 'correspondent');
          }
        }
        break;
      case '2':
        {
          const id = getActiveResultId();
          const result = results.find((item) => item.id === id);
          if (id && isAiKeyboardActionAllowed(result, 'toggle-field')) {
            e.preventDefault();
            toggleField(id, 'documentType');
          }
        }
        break;
      case '3':
        {
          const id = getActiveResultId();
          const result = results.find((item) => item.id === id);
          if (id && isAiKeyboardActionAllowed(result, 'toggle-field')) {
            e.preventDefault();
            toggleField(id, 'tags');
          }
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
