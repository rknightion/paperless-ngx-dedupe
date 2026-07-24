import { describe, expect, it } from 'vitest';
import { normalizeCustomFieldRecommendations } from '../custom-fields.js';
import type { PaperlessCustomField } from '../../paperless/types.js';

const fields: PaperlessCustomField[] = [
  {
    id: 7,
    name: 'Payment Status',
    dataType: 'select',
    extraData: {
      selectOptions: [
        { id: 'open-id', label: 'Open' },
        { id: 'paid-id', label: 'Paid' },
      ],
    },
    documentCount: 0,
  },
  {
    id: 8,
    name: 'Due Date',
    dataType: 'date',
    extraData: { selectOptions: [] },
    documentCount: 0,
  },
  {
    id: 9,
    name: 'Reference',
    dataType: 'string',
    extraData: { selectOptions: [] },
    documentCount: 0,
  },
  {
    id: 10,
    name: 'Related Documents',
    dataType: 'documentlink',
    extraData: { selectOptions: [] },
    documentCount: 0,
  },
  {
    id: 11,
    name: 'Source URL',
    dataType: 'url',
    extraData: { selectOptions: [] },
    documentCount: 0,
  },
  {
    id: 12,
    name: 'Amount',
    dataType: 'monetary',
    extraData: { selectOptions: [], defaultCurrency: 'GBP' },
    documentCount: 0,
  },
];

describe('normalizeCustomFieldRecommendations', () => {
  it('normalizes a v10 select label to its stable option ID', () => {
    const result = normalizeCustomFieldRecommendations(
      [{ fieldId: 7, value: 'Paid', confidence: 0.9, evidence: 'Paid in full' }],
      fields,
    );

    expect(result[0].value).toBe('paid-id');
  });

  it('drops unknown, unsafe, and invalid recommendations', () => {
    const result = normalizeCustomFieldRecommendations(
      [
        { fieldId: 999, value: 'x', confidence: 0.9, evidence: 'unknown field' },
        { fieldId: 10, value: [123], confidence: 0.9, evidence: 'document link' },
        { fieldId: 8, value: '23/07/2026', confidence: 0.9, evidence: 'bad date' },
        { fieldId: 9, value: 'x'.repeat(129), confidence: 0.9, evidence: 'too long' },
      ],
      fields,
    );

    expect(result).toEqual([]);
  });

  it('keeps one recommendation per field and clamps confidence', () => {
    const result = normalizeCustomFieldRecommendations(
      [
        { fieldId: 9, value: 'ABC-123', confidence: 2, evidence: 'Reference ABC-123' },
        { fieldId: 9, value: 'duplicate', confidence: 0.5, evidence: 'duplicate' },
      ],
      fields,
    );

    expect(result).toEqual([
      {
        fieldId: 9,
        fieldName: 'Reference',
        value: 'ABC-123',
        confidence: 1,
        evidence: 'Reference ABC-123',
      },
    ]);
  });

  it('allows only HTTP(S) URL schemes', () => {
    expect(
      normalizeCustomFieldRecommendations(
        [
          {
            fieldId: 11,
            value: 'https://example.com/invoice/1',
            confidence: 0.8,
            evidence: 'Invoice portal',
          },
        ],
        fields,
      )[0].value,
    ).toBe('https://example.com/invoice/1');

    for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
      expect(
        normalizeCustomFieldRecommendations(
          [{ fieldId: 11, value, confidence: 0.8, evidence: 'unsafe' }],
          fields,
        ),
      ).toEqual([]);
    }
  });

  it.each([
    ['2024-02-29', true],
    ['2023-02-29', false],
    ['2026-02-30', false],
    ['2026-07-24T00:00:00Z', false],
  ])('validates canonical calendar date %s', (value, valid) => {
    const result = normalizeCustomFieldRecommendations(
      [{ fieldId: 8, value, confidence: 0.8, evidence: 'Due date' }],
      fields,
    );
    expect(result.length > 0).toBe(valid);
  });

  it.each([
    ['GBP60229.33', true],
    ['EUR-12.00', true],
    ['60229.33', true],
    [12.34, false],
    ['gbp12.00', false],
    ['£12.00', false],
    ['GBP1.234', false],
  ])('validates canonical monetary value %s', (value, valid) => {
    const result = normalizeCustomFieldRecommendations(
      [{ fieldId: 12, value, confidence: 0.8, evidence: 'Total' }],
      fields,
    );
    expect(result.length > 0).toBe(valid);
  });

  it('drops unknown select options and normalizes evidence whitespace', () => {
    const result = normalizeCustomFieldRecommendations(
      [
        {
          fieldId: 7,
          value: 'Paid',
          confidence: 0.9,
          evidence: '  Paid \n\t in full  ',
        },
        {
          fieldId: 7,
          value: 'not-an-option',
          confidence: 0.9,
          evidence: 'ignored duplicate',
        },
      ],
      fields,
    );

    expect(result).toEqual([
      {
        fieldId: 7,
        fieldName: 'Payment Status',
        value: 'paid-id',
        confidence: 0.9,
        evidence: 'Paid in full',
      },
    ]);
  });

  it.each([
    ['string', 9],
    ['longtext', 13],
  ])('trims %s recommendations and rejects whitespace-only values', (dataType, fieldId) => {
    const definitions = [
      ...fields,
      {
        id: fieldId,
        name: dataType,
        dataType: dataType as 'string' | 'longtext',
        extraData: { selectOptions: [] },
        documentCount: 0,
      },
    ];
    expect(
      normalizeCustomFieldRecommendations(
        [{ fieldId, value: '  value  ', confidence: 0.8, evidence: 'text' }],
        definitions,
      )[0]?.value,
    ).toBe('value');
    expect(
      normalizeCustomFieldRecommendations(
        [{ fieldId, value: ' \n\t ', confidence: 0.8, evidence: 'text' }],
        definitions,
      ),
    ).toEqual([]);
  });

  it('accepts an exact select ID before labels but rejects ambiguous case-insensitive labels', () => {
    const collision = {
      ...fields[0],
      extraData: {
        selectOptions: [
          { id: 'paid', label: 'Paid' },
          { id: 'other', label: 'PAID' },
          { id: 'unicode-a', label: 'État' },
          { id: 'unicode-b', label: 'E\u0301TAT' },
        ],
      },
    };

    expect(
      normalizeCustomFieldRecommendations(
        [{ fieldId: 7, value: 'paid', confidence: 0.9, evidence: 'exact ID' }],
        [collision],
      )[0]?.value,
    ).toBe('paid');
    for (const value of ['PaId', 'état', ' état ']) {
      expect(
        normalizeCustomFieldRecommendations(
          [{ fieldId: 7, value, confidence: 0.9, evidence: 'ambiguous label' }],
          [collision],
        ),
      ).toEqual([]);
    }
  });
});
