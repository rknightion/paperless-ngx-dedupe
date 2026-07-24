import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultFieldSelection,
  fieldSelections,
  initializeFieldSelection,
  resetStore,
  clearSelection,
  removeSelection,
  selectAllIds,
  selectedIds,
  toggleAiFieldSelection,
} from './AiReviewStore.svelte';

describe('AI field selection', () => {
  afterEach(() => resetStore());
  const result = {
    suggestedTitle: 'New title',
    suggestedCorrespondent: 'Alice',
    suggestedDocumentType: null,
    suggestedTags: ['finance'],
    suggestedCustomFields: [
      { fieldId: 9, fieldName: 'Invoice number', value: 'INV-1', confidence: 0.9 },
      { fieldId: 3, fieldName: 'Amount', value: 10, confidence: 0.8 },
    ],
  } as never;

  it('creates explicit processed-tag and per-custom-field review state', () => {
    expect(
      createDefaultFieldSelection(result, {
        title: true,
        correspondent: true,
        documentType: true,
        tags: true,
        customFields: true,
        processedTag: true,
      }),
    ).toEqual({
      title: true,
      correspondent: true,
      documentType: false,
      tags: true,
      processedTag: false,
      customFieldIds: [3, 9],
    });
  });

  it('toggles one custom field without changing any other reviewed field', () => {
    const original = createDefaultFieldSelection(result);
    const changed = toggleAiFieldSelection(original, 'customField:9');

    expect(changed.customFieldIds).toEqual([3]);
    expect(changed.title).toBe(true);
    expect(original.customFieldIds).toEqual([3, 9]);
  });

  it('initializes once and preserves the reviewer selection across drawer reloads', () => {
    initializeFieldSelection('result-1', result);
    fieldSelections.set('result-1', {
      ...fieldSelections.get('result-1')!,
      correspondent: false,
    });

    initializeFieldSelection('result-1', result);

    expect(fieldSelections.get('result-1')?.correspondent).toBe(false);
  });

  it('keeps explicit selections from other cursor pages', () => {
    selectedIds.add('page-one');
    selectedIds.add('page-two');

    expect([...selectedIds]).toEqual(['page-one', 'page-two']);
  });

  it('adds and removes only visible IDs without clearing another cursor page', () => {
    selectAllIds(['page-one']);
    selectAllIds(['page-two']);
    clearSelection(['page-two']);

    expect([...selectedIds]).toEqual(['page-one']);
  });

  it('prunes a rejected result without changing other selected IDs', () => {
    selectedIds.add('rejected');
    selectedIds.add('keep');

    removeSelection('rejected');

    expect([...selectedIds]).toEqual(['keep']);
  });
});
