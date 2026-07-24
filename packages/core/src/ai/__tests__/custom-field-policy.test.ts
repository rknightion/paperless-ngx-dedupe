import { beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseWithHandle, type AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { PaperlessCustomField } from '../../paperless/types.js';
import { setConfig } from '../../queries/config.js';
import { getConfig } from '../../queries/config.js';
import type { CustomFieldPolicyError } from '../custom-field-policy.js';
import {
  CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES,
  renderCustomFieldPromptBlock,
  getCustomFieldPolicy,
  replaceCustomFieldPolicy,
  resolveCustomFieldPolicy,
} from '../custom-field-policy.js';

function field(
  id: number,
  name: string,
  dataType: PaperlessCustomField['dataType'] = 'string',
): PaperlessCustomField {
  return {
    id,
    name,
    dataType,
    extraData: { selectOptions: [] },
    documentCount: 0,
  };
}

describe('AI custom-field policy', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    ({ db } = createDatabaseWithHandle(':memory:'));
    await migrateDatabase(
      (db as unknown as { $client: Parameters<typeof migrateDatabase>[0] }).$client,
    );
  });

  it('stores server-derived snapshots and returns fields in numeric ID order', () => {
    replaceCustomFieldPolicy(
      db,
      [{ fieldId: 9, guidance: '  Prefer the invoice total.  ' }, { fieldId: 2 }],
      [field(2, 'Due date', 'date'), field(9, 'Amount', 'monetary')],
    );

    expect(getCustomFieldPolicy(db)).toEqual([
      {
        fieldId: 2,
        fieldName: 'Due date',
        dataType: 'date',
        guidance: null,
      },
      {
        fieldId: 9,
        fieldName: 'Amount',
        dataType: 'monetary',
        guidance: 'Prefer the invoice total.',
      },
    ]);
  });

  it.each([
    {
      name: 'duplicate IDs',
      requested: [{ fieldId: 2 }, { fieldId: 2 }],
      live: [field(2, 'Due date', 'date')],
      code: 'duplicate_field',
    },
    {
      name: 'unknown IDs',
      requested: [{ fieldId: 99 }],
      live: [field(2, 'Due date', 'date')],
      code: 'unknown_field',
    },
    {
      name: 'document links',
      requested: [{ fieldId: 2 }],
      live: [field(2, 'Related', 'documentlink')],
      code: 'unsupported_field',
    },
    {
      name: 'overlong guidance',
      requested: [{ fieldId: 2, guidance: 'x'.repeat(501) }],
      live: [field(2, 'Due date', 'date')],
      code: 'invalid_guidance',
    },
  ])('rejects $name without replacing the prior policy', ({ requested, live, code }) => {
    replaceCustomFieldPolicy(db, [{ fieldId: 1 }], [field(1, 'Reference')]);

    expect(() => replaceCustomFieldPolicy(db, requested, live)).toThrowError(
      expect.objectContaining<Partial<CustomFieldPolicyError>>({
        code: code as CustomFieldPolicyError['code'],
      }),
    );
    expect(getCustomFieldPolicy(db).map(({ fieldId }) => fieldId)).toEqual([1]);
  });

  it('caps the allowlist at 50 fields', () => {
    const live = Array.from({ length: 51 }, (_, index) => field(index + 1, `Field ${index + 1}`));

    expect(() =>
      replaceCustomFieldPolicy(
        db,
        live.map(({ id }) => ({ fieldId: id })),
        live,
      ),
    ).toThrowError(expect.objectContaining({ code: 'too_many_fields' }));
  });

  it.each([
    {
      name: 'missing',
      live: [] as PaperlessCustomField[],
      code: 'missing_field',
    },
    {
      name: 'renamed',
      live: [field(2, 'Payment date', 'date')],
      code: 'renamed_field',
    },
    {
      name: 'type-changed',
      live: [field(2, 'Due date', 'string')],
      code: 'type_changed_field',
    },
  ])('fails closed when a selected field is $name', ({ live, code }) => {
    replaceCustomFieldPolicy(db, [{ fieldId: 2 }], [field(2, 'Due date', 'date')]);

    expect(() => resolveCustomFieldPolicy(db, live)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects enabled extraction with an empty allowlist', () => {
    expect(() => resolveCustomFieldPolicy(db, [])).toThrowError(
      expect.objectContaining({ code: 'empty_policy' }),
    );
  });

  it('cannot clear the policy while extraction is enabled and rolls back the replacement', () => {
    replaceCustomFieldPolicy(db, [{ fieldId: 2 }], [field(2, 'Due date', 'date')]);
    setConfig(db, 'ai.extractCustomFields', true);

    expect(() => replaceCustomFieldPolicy(db, [], [])).toThrowError(
      expect.objectContaining({ code: 'empty_policy' }),
    );
    expect(getCustomFieldPolicy(db)).toEqual([
      { fieldId: 2, fieldName: 'Due date', dataType: 'date', guidance: null },
    ]);
    expect(getConfig(db)['ai.extractCustomFields']).toBe('true');
  });

  it('returns only allowlisted live definitions with guidance in numeric ID order', () => {
    replaceCustomFieldPolicy(
      db,
      [{ fieldId: 9, guidance: 'Use the final amount.' }, { fieldId: 2 }],
      [field(9, 'Amount', 'monetary'), field(2, 'Due date', 'date'), field(4, 'Ignored')],
    );

    expect(
      resolveCustomFieldPolicy(db, [
        field(4, 'Ignored'),
        field(9, 'Amount', 'monetary'),
        field(2, 'Due date', 'date'),
      ]),
    ).toEqual([
      { ...field(2, 'Due date', 'date'), guidance: null },
      { ...field(9, 'Amount', 'monetary'), guidance: 'Use the final amount.' },
    ]);
  });

  it.each([
    {
      name: 'multibyte field name beyond its UTF-8 limit',
      live: [{ ...field(2, '💷'.repeat(65)), name: '💷'.repeat(65) }],
      code: 'invalid_definition',
    },
    {
      name: 'too many select options',
      live: [
        {
          ...field(2, 'Status', 'select'),
          extraData: {
            selectOptions: Array.from({ length: 101 }, (_, index) => ({
              id: `id-${index}`,
              label: `Option ${index}`,
            })),
          },
        },
      ],
      code: 'invalid_definition',
    },
    {
      name: 'duplicate select option IDs',
      live: [
        {
          ...field(2, 'Status', 'select'),
          extraData: {
            selectOptions: [
              { id: 'same', label: 'First' },
              { id: 'same', label: 'Second' },
            ],
          },
        },
      ],
      code: 'invalid_definition',
    },
    {
      name: 'overlong multibyte select label',
      live: [
        {
          ...field(2, 'Status', 'select'),
          extraData: {
            selectOptions: [{ id: 'one', label: '💷'.repeat(65) }],
          },
        },
      ],
      code: 'invalid_definition',
    },
    {
      name: 'unknown runtime field type',
      live: [
        {
          ...field(2, 'Unexpected'),
          dataType: 'bogus',
        } as unknown as PaperlessCustomField,
      ],
      code: 'invalid_definition',
    },
  ])('rejects $name at policy save', ({ live, code }) => {
    expect(() => replaceCustomFieldPolicy(db, [{ fieldId: 2 }], live)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('accepts a custom-field prompt block at the exact aggregate UTF-8 boundary', () => {
    const fixed = Array.from({ length: 38 }, (_, index) => ({
      ...field(index + 1, 'n'.repeat(256)),
      guidance: 'g'.repeat(500),
    }));
    let final = { ...field(39, 'n'), guidance: null as string | null };
    const base = renderCustomFieldPromptBlock([...fixed, final]);
    let remaining = CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES - Buffer.byteLength(base, 'utf8');

    const nameGrowth = Math.min(255, remaining);
    final = { ...final, name: 'n'.repeat(1 + nameGrowth) };
    remaining -= nameGrowth;
    if (remaining > 0) {
      const oneGuidance = renderCustomFieldPromptBlock([...fixed, { ...final, guidance: 'g' }]);
      const guidanceOverhead =
        Buffer.byteLength(oneGuidance, 'utf8') -
        Buffer.byteLength(renderCustomFieldPromptBlock([...fixed, final]), 'utf8') -
        1;
      remaining -= guidanceOverhead;
      final = { ...final, guidance: 'g'.repeat(remaining) };
    }

    const exact = renderCustomFieldPromptBlock([...fixed, final]);
    expect(Buffer.byteLength(exact, 'utf8')).toBe(CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES);
  });

  it('fails closed when mutable live options grow beyond the aggregate prompt budget', () => {
    const original = {
      ...field(2, 'Status', 'select'),
      extraData: { selectOptions: [{ id: 'open', label: 'Open' }] },
    };
    replaceCustomFieldPolicy(db, [{ fieldId: 2 }], [original]);

    const grown = {
      ...original,
      extraData: {
        selectOptions: Array.from({ length: 100 }, (_, index) => ({
          id: `option-${index}-${'x'.repeat(200)}`,
          label: `Label ${index} ${'y'.repeat(200)}`,
        })),
      },
    };
    expect(() => resolveCustomFieldPolicy(db, [grown])).toThrowError(
      expect.objectContaining({ code: 'prompt_too_large' }),
    );
  });

  it('rejects an aggregate multibyte prompt overflow before replacing the saved policy', () => {
    const live = Array.from({ length: 40 }, (_, index) => field(index + 1, `Field ${index + 1}`));
    expect(() =>
      replaceCustomFieldPolicy(
        db,
        live.map(({ id }) => ({ fieldId: id, guidance: 'é'.repeat(500) })),
        live,
      ),
    ).toThrowError(expect.objectContaining({ code: 'prompt_too_large' }));
    expect(getCustomFieldPolicy(db)).toEqual([]);
  });

  it('renders canonical select options without extra properties or custom serialization', () => {
    const option = {
      id: 'paid',
      label: 'Paid',
      injected: 'must-not-render',
      toJSON: () => ({ id: 'hijacked', label: 'Hijacked', injected: 'must-not-render' }),
    };
    const block = renderCustomFieldPromptBlock([
      {
        ...field(2, 'Status', 'select'),
        extraData: { selectOptions: [option] },
      },
    ]);

    expect(block).toContain('"id": "paid"');
    expect(block).toContain('"label": "Paid"');
    expect(block).not.toContain('hijacked');
    expect(block).not.toContain('must-not-render');
    expect(block).not.toContain('injected');
  });
});
