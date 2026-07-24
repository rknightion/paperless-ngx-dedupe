export type AvailableCustomField = {
  id: number;
  name: string;
  dataType: string;
  extraData?: {
    selectOptions?: Array<{ id: string; label: string }>;
    defaultCurrency?: string | null;
  };
};

export type CustomFieldPolicySnapshot = {
  fieldId: number;
  fieldName: string;
  dataType: string;
  guidance: string | null;
};

export type CustomFieldSelection = {
  fieldId: number;
  selected: boolean;
  guidance: string;
};

export const MAX_CUSTOM_FIELD_SELECTIONS = 50;

export function isCustomFieldSelectionDisabled(
  selection: Pick<CustomFieldSelection, 'selected'>,
  selectedCount: number,
): boolean {
  return !selection.selected && selectedCount >= MAX_CUSTOM_FIELD_SELECTIONS;
}

export function toggleCustomFieldSelection(
  selections: readonly CustomFieldSelection[],
  fieldId: number,
): CustomFieldSelection[] {
  const target = selections.find((selection) => selection.fieldId === fieldId);
  if (!target) return [...selections];
  const selectedCount = selections.filter(({ selected }) => selected).length;
  if (isCustomFieldSelectionDisabled(target, selectedCount)) return [...selections];
  return selections.map((selection) =>
    selection.fieldId === fieldId ? { ...selection, selected: !selection.selected } : selection,
  );
}

export function createCustomFieldSelections(
  available: readonly AvailableCustomField[],
  policy: readonly CustomFieldPolicySnapshot[],
): CustomFieldSelection[] {
  return [...available]
    .sort((left, right) => left.id - right.id)
    .map((field) => {
      const configured = policy.find((entry) => entry.fieldId === field.id);
      return {
        fieldId: field.id,
        selected: configured !== undefined,
        guidance: configured?.guidance ?? '',
      };
    });
}

export function serializeCustomFieldSelections(
  selections: readonly CustomFieldSelection[],
): Array<{ fieldId: number; guidance?: string }> {
  return selections
    .filter(({ selected }) => selected)
    .sort((left, right) => left.fieldId - right.fieldId)
    .map(({ fieldId, guidance }) => {
      const normalized = guidance.trim();
      return { fieldId, ...(normalized ? { guidance: normalized } : {}) };
    });
}

export function staleCustomFieldPolicyEntries(
  available: readonly AvailableCustomField[],
  policy: readonly CustomFieldPolicySnapshot[],
): Array<{ fieldId: number; reason: 'missing' | 'renamed' | 'type_changed' }> {
  const stale: Array<{ fieldId: number; reason: 'missing' | 'renamed' | 'type_changed' }> = [];
  for (const entry of policy) {
    const live = available.find((field) => field.id === entry.fieldId);
    if (!live) {
      stale.push({ fieldId: entry.fieldId, reason: 'missing' });
      continue;
    }
    if (live.name !== entry.fieldName) {
      stale.push({ fieldId: entry.fieldId, reason: 'renamed' });
      continue;
    }
    if (live.dataType !== entry.dataType) {
      stale.push({ fieldId: entry.fieldId, reason: 'type_changed' });
    }
  }
  return stale;
}
