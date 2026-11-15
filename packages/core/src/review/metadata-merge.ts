import type {
  PaperlessCustomFieldInstance,
  PaperlessCustomFieldValue,
  PaperlessDocument,
} from '../paperless/types.js';

/** The metadata needed to fill a keeper without depending on document contents. */
export type MergeDocument = Pick<
  PaperlessDocument,
  'tags' | 'correspondent' | 'documentType' | 'customFields'
>;

/** Additions only; null scalar fields mean that no assignment is needed. */
export interface MetadataMergePlan {
  addTagIds: number[];
  setCorrespondent: number | null;
  setDocumentType: number | null;
  addCustomFields: PaperlessCustomFieldInstance[];
}

function isEmpty(value: PaperlessCustomFieldValue): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

interface MergeFields<Key extends string | number> {
  tags: Key[];
  correspondent: Key | null;
  documentType: Key | null;
  customFields: Array<{ field: Key; value: PaperlessCustomFieldValue }>;
}

/** Local names can use the same merge rules before live Paperless IDs are available. */
export type NamedMergeDocument = MergeFields<string>;

function hasScalarValue(value: string | number | null): boolean {
  return value !== null && value !== '';
}

function planMerge<Key extends string | number>(
  keeper: MergeFields<Key>,
  others: readonly MergeFields<Key>[],
  inboxTags: readonly Key[],
) {
  const existing = new Set([...keeper.tags, ...inboxTags]);
  const addTags: Key[] = [];
  for (const other of others) {
    for (const tag of other.tags) {
      if (!existing.has(tag)) {
        existing.add(tag);
        addTags.push(tag);
      }
    }
  }
  const populatedFields = new Set(
    keeper.customFields.filter(({ value }) => !isEmpty(value)).map(({ field }) => field),
  );
  const addCustomFields: Array<{ field: Key; value: PaperlessCustomFieldValue }> = [];
  for (const other of others) {
    for (const { field, value } of other.customFields) {
      if (populatedFields.has(field) || isEmpty(value)) continue;
      populatedFields.add(field);
      addCustomFields.push({ field, value: Array.isArray(value) ? [...value] : value });
    }
  }
  return {
    addTags,
    setCorrespondent: !hasScalarValue(keeper.correspondent)
      ? (others.find((other) => hasScalarValue(other.correspondent))?.correspondent ?? null)
      : null,
    setDocumentType: !hasScalarValue(keeper.documentType)
      ? (others.find((other) => hasScalarValue(other.documentType))?.documentType ?? null)
      : null,
    addCustomFields,
  };
}

/** Fill empty keeper values from the first nonempty member, excluding copied inbox tags. */
export function planMetadataMerge(
  keeper: MergeDocument,
  others: readonly MergeDocument[],
  { inboxTagIds }: { inboxTagIds: readonly number[] },
): MetadataMergePlan {
  const { addTags, ...fields } = planMerge(keeper, others, inboxTagIds);
  return { addTagIds: addTags, ...fields };
}

/** Describe additions by local names without exposing custom-field values in the preview. */
export function planNamedMetadataMerge(
  keeper: NamedMergeDocument,
  others: readonly NamedMergeDocument[],
  { inboxTagNames }: { inboxTagNames: readonly string[] },
) {
  const { addCustomFields, ...fields } = planMerge(keeper, others, inboxTagNames);
  return { ...fields, addCustomFieldNames: addCustomFields.map(({ field }) => field) };
}
