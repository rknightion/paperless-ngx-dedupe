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
});
