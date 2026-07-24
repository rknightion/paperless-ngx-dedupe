import { describe, expect, it } from 'vitest';

import {
  createCustomFieldSelections,
  isCustomFieldSelectionDisabled,
  toggleCustomFieldSelection,
  serializeCustomFieldSelections,
  staleCustomFieldPolicyEntries,
} from './CustomFieldPolicySettings.svelte.js';

const availableFields = [
  { id: 9, name: 'Amount', dataType: 'monetary' },
  { id: 2, name: 'Due date', dataType: 'date' },
];

describe('custom-field settings selector state', () => {
  it('hydrates live rows from the stored snapshot without selecting unrelated fields', () => {
    const selections = createCustomFieldSelections(availableFields, [
      {
        fieldId: 9,
        fieldName: 'Amount',
        dataType: 'monetary',
        guidance: 'Final amount only',
      },
    ]);

    expect(selections).toEqual([
      { fieldId: 2, selected: false, guidance: '' },
      { fieldId: 9, selected: true, guidance: 'Final amount only' },
    ]);
  });

  it('serializes selected rows only in numeric ID order', () => {
    expect(
      serializeCustomFieldSelections([
        { fieldId: 9, selected: true, guidance: ' Final amount only ' },
        { fieldId: 2, selected: true, guidance: ' ' },
        { fieldId: 4, selected: false, guidance: 'ignored' },
      ]),
    ).toEqual([{ fieldId: 2 }, { fieldId: 9, guidance: 'Final amount only' }]);
  });

  it('identifies missing, renamed, and type-changed snapshots for review', () => {
    expect(
      staleCustomFieldPolicyEntries(availableFields, [
        { fieldId: 1, fieldName: 'Missing', dataType: 'string', guidance: null },
        { fieldId: 2, fieldName: 'Payment date', dataType: 'date', guidance: null },
        { fieldId: 9, fieldName: 'Amount', dataType: 'float', guidance: null },
      ]),
    ).toEqual([
      { fieldId: 1, reason: 'missing' },
      { fieldId: 2, reason: 'renamed' },
      { fieldId: 9, reason: 'type_changed' },
    ]);
  });

  it('caps selection at 50 while keeping selected fields deselectable', () => {
    const selections = Array.from({ length: 51 }, (_, index) => ({
      fieldId: index + 1,
      selected: index < 50,
      guidance: '',
    }));

    const capped = toggleCustomFieldSelection(selections, 51);
    expect(capped.filter(({ selected }) => selected)).toHaveLength(50);
    expect(capped.find(({ fieldId }) => fieldId === 51)?.selected).toBe(false);
    expect(isCustomFieldSelectionDisabled({ selected: false }, 50)).toBe(true);
    expect(isCustomFieldSelectionDisabled({ selected: true }, 50)).toBe(false);

    const deselected = toggleCustomFieldSelection(capped, 1);
    expect(deselected.filter(({ selected }) => selected)).toHaveLength(49);
    expect(deselected.find(({ fieldId }) => fieldId === 1)?.selected).toBe(false);
  });
});
