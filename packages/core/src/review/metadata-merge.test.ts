import { describe, expect, it } from 'vitest';
import { planMetadataMerge, planNamedMetadataMerge, type MergeDocument } from './metadata-merge.js';

describe('metadata merge planning', () => {
  it('adds only missing tags and excludes inbox tags without changing the inputs', () => {
    const keeper = { tags: [1, 8], correspondent: null, documentType: null, customFields: [] };
    const others = [
      { ...keeper, tags: [1, 2, 3, 8] },
      { ...keeper, tags: [2, 4, 8] },
    ];
    expect(planMetadataMerge(keeper, others, { inboxTagIds: [3, 8] })).toEqual({
      addTagIds: [2, 4],
      setCorrespondent: null,
      setDocumentType: null,
      addCustomFields: [],
    });
    expect(keeper.tags).toEqual([1, 8]);
    expect(others.map(({ tags }) => tags)).toEqual([
      [1, 2, 3, 8],
      [2, 4, 8],
    ]);
  });

  it('fills missing scalar metadata from the first nonempty member and preserves keeper values', () => {
    const empty = { tags: [], correspondent: null, documentType: null, customFields: [] };
    const others = [
      empty,
      { ...empty, correspondent: 7, documentType: 8 },
      { ...empty, correspondent: 9, documentType: 10 },
    ];
    expect(planMetadataMerge(empty, others, { inboxTagIds: [] })).toMatchObject({
      setCorrespondent: 7,
      setDocumentType: 8,
    });
    expect(
      planMetadataMerge({ ...empty, correspondent: 11, documentType: 12 }, others, {
        inboxTagIds: [],
      }),
    ).toMatchObject({
      setCorrespondent: null,
      setDocumentType: null,
    });
  });

  it('fills empty custom fields without replacing false, zero or populated keeper values', () => {
    const keeper: MergeDocument = {
      tags: [],
      correspondent: null,
      documentType: null,
      customFields: [
        { field: 1, value: false },
        { field: 2, value: 0 },
        { field: 3, value: '' },
        { field: 4, value: null },
        { field: 5, value: [] },
        { field: 6, value: 'keeper' },
      ],
    };
    const others: MergeDocument[] = [
      {
        ...keeper,
        customFields: [
          { field: 1, value: true },
          { field: 2, value: 99 },
          { field: 3, value: 'filled' },
          { field: 4, value: null },
          { field: 5, value: [12, 13] },
          { field: 6, value: 'other' },
          { field: 7, value: 'new' },
        ],
      },
      {
        ...keeper,
        customFields: [
          { field: 4, value: 11 },
          { field: 7, value: 'later' },
          { field: 8, value: [] },
        ],
      },
    ];
    const before = structuredClone({ keeper, others });
    const plan = planMetadataMerge(keeper, others, { inboxTagIds: [] });
    expect(plan.addCustomFields).toEqual([
      { field: 3, value: 'filled' },
      { field: 5, value: [12, 13] },
      { field: 7, value: 'new' },
      { field: 4, value: 11 },
    ]);
    expect({ keeper, others }).toEqual(before);
  });

  it('uses the same fill-only rules for a preview expressed in local names', () => {
    const keeper = {
      tags: ['Kept'],
      correspondent: 'Keeper',
      documentType: null,
      customFields: [{ field: 'Count', value: 0 }],
    };
    const others = [
      {
        tags: ['Kept', 'Inbox', 'Added'],
        correspondent: 'Other',
        documentType: 'Invoice',
        customFields: [
          { field: 'Count', value: 9 },
          { field: 'Reference', value: 'A' },
        ],
      },
    ];
    expect(planNamedMetadataMerge(keeper, others, { inboxTagNames: ['Inbox'] })).toEqual({
      addTags: ['Added'],
      setCorrespondent: null,
      setDocumentType: 'Invoice',
      addCustomFieldNames: ['Reference'],
    });
  });

  it('treats empty local scalar names as missing rather than as keeper conflicts', () => {
    const empty = { tags: [], correspondent: '', documentType: '', customFields: [] };
    expect(
      planNamedMetadataMerge(
        empty,
        [empty, { ...empty, correspondent: 'Sender', documentType: 'Invoice' }],
        { inboxTagNames: [] },
      ),
    ).toEqual({
      addTags: [],
      setCorrespondent: 'Sender',
      setDocumentType: 'Invoice',
      addCustomFieldNames: [],
    });
  });

  it('proposes no further changes after its additions have been applied', () => {
    const keeper: MergeDocument = {
      tags: [1],
      correspondent: null,
      documentType: null,
      customFields: [{ field: 1, value: null }],
    };
    const others: MergeDocument[] = [
      {
        tags: [1, 2],
        correspondent: 7,
        documentType: 8,
        customFields: [
          { field: 1, value: false },
          { field: 2, value: 0 },
          { field: 3, value: [12] },
        ],
      },
    ];
    const plan = planMetadataMerge(keeper, others, { inboxTagIds: [] });
    expect(plan.addCustomFields).toEqual([
      { field: 1, value: false },
      { field: 2, value: 0 },
      { field: 3, value: [12] },
    ]);
    const fields = new Map(keeper.customFields.map(({ field, value }) => [field, value]));
    for (const { field, value } of plan.addCustomFields) fields.set(field, value);
    const merged: MergeDocument = {
      tags: [...keeper.tags, ...plan.addTagIds],
      correspondent: plan.setCorrespondent ?? keeper.correspondent,
      documentType: plan.setDocumentType ?? keeper.documentType,
      customFields: [...fields].map(([field, value]) => ({ field, value })),
    };
    expect(planMetadataMerge(merged, others, { inboxTagIds: [] })).toEqual({
      addTagIds: [],
      setCorrespondent: null,
      setDocumentType: null,
      addCustomFields: [],
    });
    expect(planMetadataMerge(merged, [], { inboxTagIds: [] })).toEqual({
      addTagIds: [],
      setCorrespondent: null,
      setDocumentType: null,
      addCustomFields: [],
    });
  });
});
