import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMatchExplanation } from '../explanations.js';

describe('buildMatchExplanation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      category: 'date',
      primaryText: 'Invoice date 15/01/2024',
      comparisonText: 'Invoice date 15/01/2024',
      shared: '15012024',
    },
    {
      category: 'amount',
      primaryText: 'Total £1,234.56',
      comparisonText: 'Total £1,234.56',
      shared: '1234.56',
    },
    {
      category: 'identifier',
      primaryText: 'Invoice number INV-2024-001',
      comparisonText: 'Invoice number INV-2024-001',
      shared: 'inv2024001',
    },
    {
      category: 'reference',
      primaryText: 'Reference 784631492683',
      comparisonText: 'Reference 784631492683',
      shared: '784631492683',
    },
    {
      category: 'route',
      primaryText: 'From LHR to JFK',
      comparisonText: 'From LHR to JFK',
      shared: 'lhr → jfk',
    },
  ])('explains a shared $category', ({ category, primaryText, comparisonText, shared }) => {
    const explanation = buildMatchExplanation(
      [
        { documentId: 'primary', text: primaryText },
        { documentId: 'comparison', text: comparisonText },
      ],
      'primary',
    );

    expect(explanation).toEqual({
      primaryDocumentId: 'primary',
      comparisons: [
        expect.objectContaining({
          documentId: 'comparison',
          shared: expect.arrayContaining([
            expect.objectContaining({
              category,
              values: expect.arrayContaining([shared]),
            }),
          ]),
        }),
      ],
    });
  });

  it.each([
    {
      category: 'date',
      primaryText: 'Invoice date 15/01/2024',
      comparisonText: 'Invoice date 16/01/2024',
      primary: '15012024',
      comparison: '16012024',
    },
    {
      category: 'amount',
      primaryText: 'Total £1,234.56',
      comparisonText: 'Total £1,250.00',
      primary: '1234.56',
      comparison: '1250.00',
    },
    {
      category: 'identifier',
      primaryText: 'Invoice number INV-2024-001',
      comparisonText: 'Invoice number INV-2024-002',
      primary: 'inv2024001',
      comparison: 'inv2024002',
    },
    {
      category: 'reference',
      primaryText: 'Reference 784631492683',
      comparisonText: 'Reference 784631492684',
      primary: '784631492683',
      comparison: '784631492684',
    },
    {
      category: 'route',
      primaryText: 'From LHR to JFK',
      comparisonText: 'From JFK to LHR',
      primary: 'lhr → jfk',
      comparison: 'jfk → lhr',
    },
  ])(
    'explains a differing $category',
    ({ category, primaryText, comparisonText, primary, comparison }) => {
      const explanation = buildMatchExplanation(
        [
          { documentId: 'primary', text: primaryText },
          { documentId: 'comparison', text: comparisonText },
        ],
        'primary',
      );

      expect(explanation?.comparisons[0].differences).toContainEqual(
        expect.objectContaining({
          category,
          primaryValues: expect.arrayContaining([primary]),
          comparisonValues: expect.arrayContaining([comparison]),
        }),
      );
    },
  );

  it('bounds the number and length of display values', () => {
    const references = Array.from({ length: 20 }, (_, index) => `${index + 1}`.padStart(80, '9'));
    const explanation = buildMatchExplanation(
      [
        { documentId: 'primary', text: references.join(' ') },
        { documentId: 'comparison', text: references.join(' ') },
      ],
      'primary',
    );

    const reference = explanation?.comparisons[0].shared.find(
      (entry) => entry.category === 'reference',
    );
    expect(reference?.values).toHaveLength(4);
    expect(reference?.values.every((value) => value.length <= 40)).toBe(true);
  });

  it('keeps colliding long shared values distinguishable after bounding', () => {
    const first = `${'1'.repeat(25)}${'2'.repeat(30)}${'9'.repeat(25)}`;
    const second = `${'1'.repeat(25)}${'3'.repeat(30)}${'9'.repeat(25)}`;
    const text = `References ${first} ${second}`;

    const explanation = buildMatchExplanation(
      [
        { documentId: 'primary', text },
        { documentId: 'comparison', text },
      ],
      'primary',
    );
    const values = explanation?.comparisons[0].shared.find(
      (entry) => entry.category === 'reference',
    )?.values;

    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(values?.length);
    expect(values?.every((value) => value.length <= 40)).toBe(true);
    expect(values?.join(' ')).not.toContain('2'.repeat(30));
    expect(values?.join(' ')).not.toContain('3'.repeat(30));
  });

  it('keeps colliding long differing values distinguishable after bounding', () => {
    const primaryValues = [
      `${'4'.repeat(25)}${'5'.repeat(30)}${'8'.repeat(25)}`,
      `${'4'.repeat(25)}${'6'.repeat(30)}${'8'.repeat(25)}`,
    ];
    const comparisonValues = [
      `${'4'.repeat(25)}${'1'.repeat(30)}${'8'.repeat(25)}`,
      `${'4'.repeat(25)}${'2'.repeat(30)}${'8'.repeat(25)}`,
    ];

    const explanation = buildMatchExplanation(
      [
        { documentId: 'primary', text: primaryValues.join(' ') },
        { documentId: 'comparison', text: comparisonValues.join(' ') },
      ],
      'primary',
    );
    const difference = explanation?.comparisons[0].differences.find(
      (entry) => entry.category === 'reference',
    );

    expect(difference?.primaryValues).toHaveLength(2);
    expect(new Set(difference?.primaryValues).size).toBe(difference?.primaryValues.length);
    expect(difference?.comparisonValues).toHaveLength(2);
    expect(new Set(difference?.comparisonValues).size).toBe(difference?.comparisonValues.length);
    expect(
      [...(difference?.primaryValues ?? []), ...(difference?.comparisonValues ?? [])].every(
        (value) => value.length <= 40,
      ),
    ).toBe(true);
  });

  it('sorts comparisons independently of document input order', () => {
    const documents = [
      { documentId: 'primary', text: 'Total £25.00' },
      { documentId: 'z-document', text: 'Total £25.00' },
      { documentId: 'a-document', text: 'Total £25.00' },
    ];

    const forward = buildMatchExplanation(documents, 'primary');
    const reverse = buildMatchExplanation([...documents].reverse(), 'primary');

    expect(forward).toEqual(reverse);
    expect(forward?.comparisons.map((comparison) => comparison.documentId)).toEqual([
      'a-document',
      'z-document',
    ]);
  });

  it('does not log OCR text or extracted values', () => {
    const spies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    const secret = 'Account number 999999999999';

    buildMatchExplanation(
      [
        { documentId: 'primary', text: secret },
        { documentId: 'comparison', text: secret },
      ],
      'primary',
    );

    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it('returns no explanation without a primary and comparison document', () => {
    expect(buildMatchExplanation([], 'missing')).toBeNull();
    expect(
      buildMatchExplanation([{ documentId: 'primary', text: 'Total £1.00' }], 'primary'),
    ).toEqual({
      primaryDocumentId: 'primary',
      comparisons: [],
    });
  });
});
