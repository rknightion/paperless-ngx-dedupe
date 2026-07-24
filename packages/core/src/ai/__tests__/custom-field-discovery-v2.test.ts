import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  adaptCustomFieldDiscoveryV2ToLegacy,
  scanCustomFieldCandidatesV2,
  type CustomFieldDiscoveryPageSourceV2,
  type CustomFieldDiscoverySourceItemV2,
} from '../custom-field-discovery-v2.js';

function pageSource(
  items: readonly CustomFieldDiscoverySourceItemV2[],
  options: { fingerprint?: string; currentFingerprint?: string; opaqueToken?: string } = {},
): {
  source: CustomFieldDiscoveryPageSourceV2;
  reads: Array<{ pass: string; cursor: string | null; limit: number }>;
} {
  const reads: Array<{ pass: string; cursor: string | null; limit: number }> = [];
  const fingerprint = options.fingerprint ?? 'source-v1';
  return {
    reads,
    source: {
      opaqueToken:
        options.opaqueToken ?? '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
      snapshot: {
        fingerprint,
        capturedAt: '2026-07-24T10:00:00.000Z',
        documentCount: items.length,
      },
      async readPage(request) {
        reads.push({ pass: request.pass, cursor: request.cursor, limit: request.limit });
        const offset = request.cursor === null ? 0 : Number(request.cursor);
        const page = items.slice(offset, offset + request.limit);
        const nextOffset = offset + page.length;
        return {
          items: page,
          nextCursor: nextOffset < items.length ? String(nextOffset) : null,
        };
      },
      async readCurrentFingerprint() {
        return options.currentFingerprint ?? fingerprint;
      },
    },
  };
}

function documents(
  count: number,
  content: (index: number) => string | null,
  domain?: (index: number) => string | null,
): CustomFieldDiscoverySourceItemV2[] {
  return Array.from({ length: count }, (_, index) => ({
    ocrText: content(index),
    domain: domain?.(index),
  }));
}

describe('scanCustomFieldCandidatesV2', () => {
  it('uses keyset pages for deterministic two-pass discovery and returns aggregates only', async () => {
    const { source, reads } = pageSource(
      documents(12, (index) =>
        [
          `Account Number: ACC-${String(index + 1).padStart(4, '0')}`,
          `Payment Status: ${index % 2 === 0 ? 'Paid' : 'Open'}`,
          `Due Date: 2026-08-${String(index + 1).padStart(2, '0')}`,
          'Document Type: Invoice',
        ].join('\n'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, {
      pageSize: 5,
      minimumGlobalDocuments: 3,
    });

    expect(result).toMatchObject({
      runKey: expect.stringMatching(/^[a-f0-9]{32}$/),
      algorithmVersion: 'custom-field-discovery-v2',
      status: 'completed',
      phase: 'complete',
      documentsScanned: 12,
      documentsWithOcr: 12,
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{32}$/),
      stale: false,
      truncatedLabelSpace: false,
    });
    expect(reads.map(({ pass }) => pass)).toEqual([
      'labels',
      'labels',
      'labels',
      'profiles',
      'profiles',
      'profiles',
    ]);
    expect(result.diagnostics.source).toEqual({
      fingerprint: result.sourceFingerprint,
      capturedAt: '2026-07-24T10:00:00.000Z',
      documentCount: 12,
    });
    expect(result.diagnostics.scan).toMatchObject({
      complete: true,
      labelPassDocuments: 12,
      profilePassDocuments: 12,
    });
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringMatching(/^[a-f0-9]{24}$/),
          name: 'Account Number',
          recommendedDataType: 'string',
          recommendation: 'review_carefully',
          documentCount: 12,
          utilityScore: expect.any(Number),
          valueProfile: expect.objectContaining({
            distinctEstimate: { lowerBound: 12, capped: false },
            patternShapes: expect.any(Array),
          }),
          risks: expect.arrayContaining(['high_cardinality', 'sensitive_value']),
        }),
        expect.objectContaining({
          name: 'Payment Status',
          recommendedDataType: 'select',
          valueProfile: expect.objectContaining({
            selectOptions: [
              { value: 'Open', documentCount: 6 },
              { value: 'Paid', documentCount: 6 },
            ],
          }),
        }),
        expect.objectContaining({
          name: 'Due Date',
          recommendedDataType: 'date',
          documentCount: 12,
        }),
      ]),
    );
    expect(result.candidates.some(({ name }) => name === 'Document Type')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ACC-0001');
    expect(JSON.stringify(result)).not.toContain('ocrText');
    expect(JSON.stringify(result)).not.toContain('examples');
    expect(result.candidates[0]).not.toHaveProperty('normalizedName');
    expect(result.candidates[0]).not.toHaveProperty('dataType');
  });

  it('qualifies fields with strong domain support even below the global threshold', async () => {
    const { source } = pageSource(
      documents(
        100,
        (index) => (index < 8 ? 'Claim Outcome: Accepted' : 'Title: General'),
        (index) => (index < 8 ? 'insurance' : 'general'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, {
      minimumGlobalDocuments: 20,
      minimumDomainDocuments: 5,
      minimumDomainCoverage: 0.5,
    });

    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        name: 'Claim Outcome',
        documentCount: 8,
        strongestDomain: {
          domainId: expect.stringMatching(/^[a-f0-9]{24}$/),
          documentCount: 8,
          domainDocumentsWithOcr: 8,
          coverage: 1,
        },
      }),
    );
  });

  it('uses exact second-pass domain totals after heavy-hitter domain eviction', async () => {
    const { source } = pageSource(
      documents(
        15,
        (index) => (index < 5 ? 'General Code: A' : 'Claim Outcome: Accepted'),
        (index) => (index < 5 ? 'general' : 'insurance'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, {
      maxTrackedDomains: 1,
      minimumGlobalDocuments: 20,
      minimumDomainDocuments: 5,
      minimumDomainCoverage: 0.9,
    });

    expect(result.candidates.find(({ name }) => name === 'Claim Outcome')?.strongestDomain).toEqual(
      {
        domainId: expect.stringMatching(/^[a-f0-9]{24}$/),
        documentCount: 10,
        domainDocumentsWithOcr: 10,
        coverage: 1,
      },
    );
  });

  it('finds late common labels deterministically across row, line, page, and domain order', async () => {
    const corpus = documents(
      24,
      (index) =>
        [`Noise ${String(index).padStart(2, '0')}: unique-${index}`, 'Claim Outcome: Paid'].join(
          '\n',
        ),
      (index) => (index % 2 === 0 ? 'Claims North' : 'Claims South'),
    );
    const variants: Array<{
      items: CustomFieldDiscoverySourceItemV2[];
      pageSize: number;
    }> = [
      { items: corpus, pageSize: 3 },
      {
        items: [...corpus].reverse().map((item) => ({
          ...item,
          ocrText: item.ocrText === null ? null : item.ocrText.split('\n').reverse().join('\n'),
        })),
        pageSize: 7,
      },
      {
        items: corpus.map((item, index) => ({
          ...item,
          domain: index % 2 === 0 ? 'Claims South' : 'Claims North',
        })),
        pageSize: 11,
      },
    ];

    const results = await Promise.all(
      variants.map(({ items, pageSize }) =>
        scanCustomFieldCandidatesV2(pageSource(items).source, {
          pageSize,
          maxLabelsPerDocument: 1,
          maxTrackedLabels: 3,
          maxTrackedDomains: 2,
          maxTrackedLabelsPerDomain: 2,
          minimumGlobalDocuments: 10,
        }),
      ),
    );

    expect(results.map(({ candidates }) => candidates.map(({ name }) => name))).toEqual([
      ['Claim Outcome'],
      ['Claim Outcome'],
      ['Claim Outcome'],
    ]);
    expect(results.map(({ candidates }) => candidates[0]?.documentCount)).toEqual([24, 24, 24]);
    const stableCandidates = results.map(({ candidates }) =>
      candidates.map(({ strongestDomain: _domain, ...candidate }) => candidate),
    );
    expect(stableCandidates[1]).toEqual(stableCandidates[0]);
    expect(stableCandidates[2]).toEqual(stableCandidates[0]);
  });

  it('only emits order-independent proven global heavy hitters after truncation', async () => {
    const corpus = documents(30, (index) =>
      [
        'Stable Field: Paid',
        ...(index < 10 ? ['Threshold Field: Open'] : []),
        `Noise ${index}: value`,
      ].join('\n'),
    );
    const variants = [
      corpus,
      [...corpus].reverse(),
      corpus.map((item) => ({
        ...item,
        ocrText: item.ocrText?.split('\n').reverse().join('\n') ?? null,
      })),
    ];

    const results = await Promise.all(
      variants.map((items) =>
        scanCustomFieldCandidatesV2(pageSource(items).source, {
          maxTrackedLabels: 2,
          minimumGlobalDocuments: 5,
        }),
      ),
    );

    expect(results.map(({ candidates }) => candidates.map(({ name }) => name))).toEqual([
      ['Stable Field'],
      ['Stable Field'],
      ['Stable Field'],
    ]);
    expect(
      results.every(({ candidates }) => candidates[0]?.recommendation === 'review_carefully'),
    ).toBe(true);
  });

  it('only emits proven domain heavy hitters independent of row and line order', async () => {
    const corpus = documents(
      40,
      (index) =>
        index < 12
          ? ['Claim Outcome: Paid', ...(index < 4 ? ['Near Domain Field: Open'] : [])].join('\n')
          : `Noise ${index}: value`,
      (index) => (index < 12 ? 'claims' : 'general'),
    );
    const variants = [
      corpus,
      [...corpus].reverse().map((item) => ({
        ...item,
        ocrText: item.ocrText?.split('\n').reverse().join('\n') ?? null,
      })),
    ];

    const results = await Promise.all(
      variants.map((items) =>
        scanCustomFieldCandidatesV2(pageSource(items).source, {
          maxTrackedLabels: 2,
          maxTrackedDomains: 4,
          maxTrackedLabelsPerDomain: 1,
          minimumGlobalDocuments: 20,
          minimumDomainDocuments: 5,
          minimumDomainCoverage: 0.5,
        }),
      ),
    );

    expect(results.map(({ candidates }) => candidates.map(({ name }) => name))).toEqual([
      ['Claim Outcome'],
      ['Claim Outcome'],
    ]);
  });

  it('profiles finalists exactly while capping labels, candidates, options, and cardinality', async () => {
    const { source } = pageSource(
      documents(30, (index) =>
        [
          ...Array.from({ length: 10 }, (_, label) => `Field ${label}: shared`),
          ...Array.from(
            { length: 20 },
            (_, label) => `Noise ${index} ${label}: unique-${index}-${label}`,
          ),
          `Reference Code: unique-${index}`,
        ].join('\n'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, {
      minimumGlobalDocuments: 2,
      maxLabelsPerDocument: 12,
      maxTrackedLabels: 32,
      maxFinalists: 6,
      maxCandidates: 3,
      maxSelectOptions: 2,
      cardinalityCap: 5,
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.diagnostics.scan.truncation).toEqual(
      expect.arrayContaining(['label_capacity', 'finalist_capacity', 'candidate_capacity']),
    );
    expect(result.diagnostics.scan.bounds).toMatchObject({
      maxTrackedLabels: 32,
      maxFinalists: 6,
      maxCandidates: 3,
      cardinalityCap: 5,
    });
    expect(result.diagnostics.scan.peakState.trackedLabels).toBeLessThanOrEqual(32);
    expect(result.diagnostics.scan.peakState.profiledLabels).toBeLessThanOrEqual(6);
    expect(result.diagnostics.scan.peakState.valuesPerLabel).toBeLessThanOrEqual(6);
    const reference = result.candidates.find(({ name }) => name === 'Reference Code');
    if (reference) {
      expect(reference.valueProfile.distinctEstimate).toEqual({ lowerBound: 6, capped: true });
      expect(reference.valueProfile.selectOptions).toBeUndefined();
      expect(reference.truncation).toContain('cardinality');
    }
  });

  it('bounds unique labels within a single adversarial OCR document', async () => {
    const { source } = pageSource([
      {
        ocrText: Array.from({ length: 5_000 }, (_, index) => `Label ${index}: value`).join('\n'),
      },
    ]);

    const result = await scanCustomFieldCandidatesV2(source, {
      maxLabelsPerDocument: 5,
      maxTrackedLabels: 8,
    });

    expect(result.truncatedLabelSpace).toBe(true);
    expect(result.diagnostics.scan.truncation).toContain('document_label_capacity');
    expect(result.diagnostics.scan.bounds.maxLabelsPerDocument).toBe(5);
    expect(result.diagnostics.scan.peakState.labelsPerDocument).toBe(5);
  });

  it('does not treat invalid calendar dates or identifier-shaped numbers as valid typed values', async () => {
    const { source } = pageSource(
      documents(10, (index) =>
        [
          `Service Date: ${index === 0 ? '2026-02-30' : `2026-03-${String(index + 1).padStart(2, '0')}`}`,
          `Policy Number: ${100000 + index}`,
          `Balance: £${(index + 1) * 10}.00`,
        ].join('\n'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });
    const date = result.candidates.find(({ name }) => name === 'Service Date');
    const policy = result.candidates.find(({ name }) => name === 'Policy Number');
    const balance = result.candidates.find(({ name }) => name === 'Balance');

    expect(date).toMatchObject({
      recommendedDataType: 'date',
      risks: expect.arrayContaining(['invalid_date']),
    });
    expect(policy).toMatchObject({
      recommendedDataType: 'string',
      risks: expect.arrayContaining(['high_cardinality', 'sensitive_value']),
    });
    expect(balance).toMatchObject({
      recommendedDataType: 'monetary',
      risks: expect.arrayContaining(['monetary_value']),
    });
  });

  it('suppresses option values when the values or label look sensitive', async () => {
    const { source } = pageSource(
      documents(
        10,
        (index) => `Customer Email: ${index % 2 === 0 ? 'alice@example.test' : 'bob@example.test'}`,
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });
    const email = result.candidates.find(({ name }) => name === 'Customer Email');

    expect(email).toMatchObject({
      risks: expect.arrayContaining(['sensitive_value']),
    });
    expect(email?.valueProfile.selectOptions).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('alice@example.test');
  });

  it('only returns select options from a conservative safe categorical vocabulary', async () => {
    const { source } = pageSource(
      documents(10, (index) => `Category: ${index % 2 === 0 ? 'Alice' : 'Bob'}`),
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });
    const category = result.candidates.find(({ name }) => name === 'Category');

    expect(category?.recommendedDataType).toBe('select');
    expect(category?.valueProfile.selectOptions).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Alice');
    expect(JSON.stringify(result)).not.toContain('Bob');
  });

  it('marks a run stale when the source changes during scanning', async () => {
    const { source } = pageSource(
      documents(3, () => 'Status: Open'),
      {
        fingerprint: 'before',
        currentFingerprint: 'after',
      },
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });

    expect(result).toMatchObject({
      status: 'incomplete',
      phase: 'incomplete',
      stale: true,
      candidates: [],
    });
    expect(result.diagnostics.scan.truncation).toContain('source_changed');
    expect(() => adaptCustomFieldDiscoveryV2ToLegacy(result)).toThrow(/incomplete|stale/i);
  });

  it('validates snapshots, detects cursor cycles and overreads, and honours cancellation', async () => {
    const invalidSnapshot = pageSource([]).source;
    invalidSnapshot.snapshot = {
      fingerprint: '',
      capturedAt: 'not-a-date',
      documentCount: -1,
    };
    await expect(scanCustomFieldCandidatesV2(invalidSnapshot)).rejects.toThrow(/snapshot/i);

    const cycle: CustomFieldDiscoveryPageSourceV2 = {
      opaqueToken: '1234567890abcdef'.repeat(4),
      snapshot: {
        fingerprint: 'cycle-source',
        capturedAt: '2026-07-24T10:00:00.000Z',
        documentCount: 10,
      },
      async readPage({ cursor }) {
        return {
          items: [{ ocrText: 'Status: Open' }],
          nextCursor: cursor === null ? 'a' : cursor === 'a' ? 'b' : 'a',
        };
      },
    };
    await expect(scanCustomFieldCandidatesV2(cycle)).rejects.toThrow(/cursor.*cycle/i);

    const overread: CustomFieldDiscoveryPageSourceV2 = {
      opaqueToken: '234567890abcdef1'.repeat(4),
      snapshot: {
        fingerprint: 'overread-source',
        capturedAt: '2026-07-24T10:00:00.000Z',
        documentCount: 1,
      },
      async readPage() {
        return {
          items: [{ ocrText: 'Status: Open' }, { ocrText: 'Status: Paid' }],
          nextCursor: null,
        };
      },
    };
    await expect(scanCustomFieldCandidatesV2(overread, { pageSize: 2 })).rejects.toThrow(
      /more documents than the snapshot/i,
    );

    const controller = new AbortController();
    controller.abort();
    const cancelled = pageSource(documents(3, () => 'Status: Open'));
    await expect(
      scanCustomFieldCandidatesV2(cancelled.source, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled.reads).toEqual([]);
  });

  it('uses one immutable snapshot token, detects mutation, and aborts after an in-flight read', async () => {
    const requestedFingerprints: string[] = [];
    const mutable = pageSource(documents(2, () => 'Status: Open'));
    const originalReadPage = mutable.source.readPage;
    mutable.source.readPage = async (request) => {
      requestedFingerprints.push(request.sourceFingerprint);
      const page = await originalReadPage(request);
      if (request.pass === 'labels') mutable.source.snapshot.fingerprint = 'mutated-private-token';
      return page;
    };

    const result = await scanCustomFieldCandidatesV2(mutable.source, {
      minimumGlobalDocuments: 1,
    });

    expect(new Set(requestedFingerprints)).toEqual(new Set(['source-v1']));
    expect(result).toMatchObject({
      status: 'incomplete',
      phase: 'incomplete',
      stale: true,
      candidates: [],
    });
    expect(result.diagnostics.scan.truncation).toContain('source_changed');
    expect(JSON.stringify(result)).not.toContain('mutated-private-token');

    const controller = new AbortController();
    let reads = 0;
    const inFlight = pageSource(documents(2, () => 'Status: Open')).source;
    const inFlightReadPage = inFlight.readPage;
    inFlight.readPage = async (request) => {
      reads++;
      const page = await inFlightReadPage(request);
      controller.abort();
      return page;
    };
    await expect(
      scanCustomFieldCandidatesV2(inFlight, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(reads).toBe(1);
  });

  it('keeps adversarial unique domain and domain-label state within declared bounds', async () => {
    const { source } = pageSource(
      documents(
        1_000,
        (index) => `Claim Outcome: Paid\nNoise ${index}: value`,
        (index) => `private-domain-${index}`,
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, {
      minimumGlobalDocuments: 10,
      maxTrackedDomains: 2,
      maxTrackedLabelsPerDomain: 2,
    });

    expect(result.diagnostics.scan.peakState).toMatchObject({
      trackedDomains: 2,
    });
    expect(result.diagnostics.scan.peakState.trackedDomainLabels).toBeLessThanOrEqual(4);
    expect(result.diagnostics.scan.truncation).toContain('domain_capacity');
    expect(JSON.stringify(result)).not.toContain('private-domain-');
  });

  it('makes short or changed scans non-actionable and rejects their legacy projection', async () => {
    const { source, reads } = pageSource(documents(2, () => 'Payment Status: Paid'));
    source.snapshot.documentCount = 3;

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 1 });

    expect(reads.map(({ pass }) => pass)).toEqual(['labels', 'profiles']);
    expect(result).toMatchObject({
      status: 'incomplete',
      phase: 'incomplete',
      stale: true,
      candidates: [],
      diagnostics: {
        scan: {
          complete: false,
          labelPassDocuments: 2,
          profilePassDocuments: 2,
        },
      },
    });
    expect(() => adaptCustomFieldDiscoveryV2ToLegacy(result)).toThrow(/incomplete|stale/i);
  });

  it('only exposes opaque source and domain identifiers and rejects sensitive labels', async () => {
    const canary = 'Patient Alice 943 476 5919';
    const { source } = pageSource(
      documents(
        5,
        () => `Patient 9434765919: secret\nAPI Key Canary: value\nClaim Outcome: Paid`,
        () => canary,
      ),
      { fingerprint: 'tenant-secret-snapshot-v1' },
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });
    const serialized = JSON.stringify(result);

    expect(result.sourceFingerprint).toMatch(/^[a-f0-9]{32}$/);
    expect(result.diagnostics.source.fingerprint).toBe(result.sourceFingerprint);
    expect(result.candidates[0]?.key).toMatch(/^[a-f0-9]{24}$/);
    expect(result.candidates[0]?.strongestDomain?.domainId).toMatch(/^[a-f0-9]{24}$/);
    expect(result.candidates.map(({ name }) => name)).toEqual(['Claim Outcome']);
    expect(serialized).not.toContain('tenant-secret');
    expect(serialized).not.toContain('Patient Alice');
    expect(serialized).not.toContain('9434765919');
    expect(serialized).not.toContain('API Key Canary');
  });

  it('requires a high-entropy source token and keys every public identifier with it', async () => {
    const corpus = documents(
      5,
      () => 'Claim Outcome: Paid',
      () => 'insurance',
    );
    const tokenA = '0123456789abcdef'.repeat(4);
    const tokenB = 'fedcba9876543210'.repeat(4);
    const resultA = await scanCustomFieldCandidatesV2(
      pageSource(corpus, { fingerprint: 'guessable-source', opaqueToken: tokenA }).source,
      { minimumGlobalDocuments: 3 },
    );
    const resultB = await scanCustomFieldCandidatesV2(
      pageSource(corpus, { fingerprint: 'guessable-source', opaqueToken: tokenB }).source,
      { minimumGlobalDocuments: 3 },
    );

    expect(resultA.sourceFingerprint).not.toBe(
      createHash('sha256').update('source\0guessable-source').digest('hex').slice(0, 32),
    );
    expect(resultA.sourceFingerprint).not.toBe(resultB.sourceFingerprint);
    expect(resultA.runKey).not.toBe(resultB.runKey);
    expect(resultA.candidates[0]?.key).not.toBe(resultB.candidates[0]?.key);
    expect(resultA.candidates[0]?.strongestDomain?.domainId).not.toBe(
      resultB.candidates[0]?.strongestDomain?.domainId,
    );
    expect(JSON.stringify(resultA)).not.toContain(tokenA);

    const weak = pageSource(corpus).source;
    weak.opaqueToken = 'short';
    await expect(scanCustomFieldCandidatesV2(weak)).rejects.toThrow(/opaque.*token|entropy/i);
  });

  it.each([
    ['date', '2026-08-01'],
    ['boolean', 'true'],
    ['url', 'https://example.test/path'],
    ['monetary', '£12.00'],
    ['integer', '42'],
    ['float', '42.5'],
  ] as const)(
    'does not let one %s value poison a document dominated by text',
    async (_type, poison) => {
      const makeOcr = (reverse: boolean) => {
        const lines = [
          `Mixed Field: ${poison}`,
          ...Array.from({ length: 100 }, (_, index) => `Mixed Field: ordinary-text-${index}`),
        ];
        return (reverse ? lines.reverse() : lines).join('\n');
      };
      const results = await Promise.all(
        [false, true].map((reverse) =>
          scanCustomFieldCandidatesV2(pageSource(documents(10, () => makeOcr(reverse))).source, {
            minimumGlobalDocuments: 3,
          }),
        ),
      );

      expect(results.map(({ candidates }) => candidates[0]?.recommendedDataType)).toEqual([
        'string',
        'string',
      ]);
      expect(results.map(({ candidates }) => candidates[0]?.recommendation)).toEqual([
        'review_carefully',
        'review_carefully',
      ]);
      if (_type === 'monetary') {
        expect(results[0].candidates[0]?.risks).toContain('monetary_value');
      }
      expect(results[1].candidates).toEqual(results[0].candidates);
    },
  );

  it('deduplicates repeated lines and treats genuinely mixed document types as ambiguous', async () => {
    const { source } = pageSource(
      documents(10, () =>
        [
          ...Array.from({ length: 100 }, () => 'Mixed Field: 2026-08-01'),
          ...Array.from({ length: 100 }, () => 'Mixed Field: ordinary text'),
        ].join('\n'),
      ),
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });

    expect(result.candidates[0]).toMatchObject({
      recommendedDataType: 'string',
      recommendation: 'review_carefully',
    });
    expect(result.candidates[0]?.matchCount).toBe(2_000);
  });

  it.each([
    ['boolean and URL', 'true', 'https://example.test/value'],
    ['date and integer', '2026-08-01', '42'],
    ['monetary and float', '£12.00', '42.5'],
  ] as const)(
    'keeps corpus-level 50/50 and 70/30 %s conflicts as string review candidates',
    async (_name, firstValue, secondValue) => {
      for (const firstCount of [5, 7]) {
        const corpus = documents(
          10,
          (index) => `Mixed Field: ${index < firstCount ? firstValue : secondValue}`,
        );
        const results = await Promise.all([
          scanCustomFieldCandidatesV2(pageSource(corpus).source, {
            pageSize: 1,
            minimumGlobalDocuments: 3,
          }),
          scanCustomFieldCandidatesV2(pageSource([...corpus].reverse()).source, {
            pageSize: 7,
            minimumGlobalDocuments: 3,
          }),
        ]);

        expect(results.map(({ candidates }) => candidates[0]?.recommendedDataType)).toEqual([
          'string',
          'string',
        ]);
        expect(results.map(({ candidates }) => candidates[0]?.recommendation)).toEqual([
          'review_carefully',
          'review_carefully',
        ]);
        expect(results[1].candidates).toEqual(results[0].candidates);
      }
    },
  );

  it('never recommends select when invalid or sensitive typed signals are present', async () => {
    const cases = [
      documents(10, (index) => `Mixed Field: ${index % 2 === 0 ? '2026-02-30' : '2026-02-31'}`),
      documents(
        10,
        (index) => `Mixed Field: ${index % 2 === 0 ? 'alice@example.test' : 'bob@example.test'}`,
      ),
    ];

    for (const corpus of cases) {
      const result = await scanCustomFieldCandidatesV2(pageSource(corpus).source, {
        minimumGlobalDocuments: 3,
      });
      expect(result.candidates[0]).toMatchObject({
        recommendedDataType: 'string',
        recommendation: 'review_carefully',
      });
    }
  });

  it('cooperatively yields during huge OCR parsing so a real timer can cancel pass one', async () => {
    const huge = pageSource([
      {
        ocrText: Array.from(
          { length: 60_000 },
          (_, index) => `Field ${index}: ordinary-value-${index}`,
        ).join('\n'),
      },
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);

    try {
      await expect(
        scanCustomFieldCandidatesV2(huge.source, {
          signal: controller.signal,
          maxLabelsPerDocument: 8,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      clearTimeout(timer);
    }
    expect(huge.reads.map(({ pass }) => pass)).toEqual(['labels']);
  });

  it('rejects options that exceed absolute scanner state ceilings', async () => {
    const source = pageSource([]).source;

    await expect(
      scanCustomFieldCandidatesV2(source, { cardinalityCap: 1_000_000 }),
    ).rejects.toThrow(/cardinalityCap.*maximum/i);
    await expect(
      scanCustomFieldCandidatesV2(source, { maxTrackedDomains: 1_000_000 }),
    ).rejects.toThrow(/maxTrackedDomains.*maximum/i);
  });

  it('bounds cursor and option accounting and checks cancellation inside huge OCR parsing', async () => {
    let checks = 0;
    const signal = {
      throwIfAborted() {
        checks++;
        if (checks > 20) throw new DOMException('Aborted', 'AbortError');
      },
    } as AbortSignal;
    const huge = pageSource([
      {
        ocrText: Array.from({ length: 50_000 }, (_, index) => `Field ${index}: value`).join('\n'),
      },
    ]);

    await expect(
      scanCustomFieldCandidatesV2(huge.source, { signal, maxLabelsPerDocument: 4 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(checks).toBeGreaterThan(20);

    const result = await scanCustomFieldCandidatesV2(
      pageSource(documents(100, (index) => `Payment Status: ${index % 2 ? 'Open' : 'Paid'}`))
        .source,
      { pageSize: 1, maxSelectOptions: 2 },
    );
    expect(result.diagnostics.scan.peakState.cursorHashes).toBeLessThanOrEqual(
      result.diagnostics.scan.bounds.maxCursorHashes,
    );
    expect(result.diagnostics.scan.peakState.selectOptionsPerCandidate).toBeLessThanOrEqual(2);
  });

  it('normalizes Unicode labels, infers URLs per document, and rejects loose currency grouping', async () => {
    const { source } = pageSource(
      documents(10, (index) => {
        const portal =
          index === 0
            ? Array.from({ length: 100 }, () => 'Portail: true').join('\n')
            : `Portail: https://example.test/${index}`;
        return [
          'Ｓｔａｔｕｓ: Paid',
          'Référence Client: safe',
          portal,
          'Loose Amount: £12,34',
        ].join('\n');
      }),
    );

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });

    expect(result.candidates.find(({ name }) => name === 'Status')).toBeDefined();
    expect(result.candidates.find(({ name }) => name === 'Référence Client')).toBeDefined();
    expect(result.candidates.find(({ name }) => name === 'Portail')).toMatchObject({
      recommendedDataType: 'url',
    });
    expect(result.candidates.find(({ name }) => name === 'Loose Amount')).not.toMatchObject({
      recommendedDataType: 'monetary',
      risks: expect.arrayContaining(['monetary_value']),
    });
  });

  it.each([
    ['nine digit identifier', 'Case Code: 123456789'],
    ['NHS-style number', 'Health Code: 943 476 5919'],
    ['mobile number', 'Contact Code: 07123 456789'],
  ])('marks %s values sensitive without emitting the value', async (_name, field) => {
    const { source } = pageSource(documents(5, () => field));

    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });

    expect(result.candidates[0]?.risks).toContain('sensitive_value');
    expect(JSON.stringify(result)).not.toContain(field.split(': ')[1]);
  });

  it('completely scans 50k documents twice with bounded state', async () => {
    const count = 50_000;
    let itemsRead = 0;
    const source: CustomFieldDiscoveryPageSourceV2 = {
      opaqueToken: 'abcdef0123456789'.repeat(4),
      snapshot: {
        fingerprint: '50k-v1',
        capturedAt: '2026-07-24T10:00:00.000Z',
        documentCount: count,
      },
      async readPage({ cursor, limit }) {
        const offset = cursor === null ? 0 : Number(cursor);
        const size = Math.min(limit, count - offset);
        itemsRead += size;
        return {
          items: Array.from({ length: size }, (_, relativeIndex) => ({
            ocrText: `Payment Status: ${(offset + relativeIndex) % 2 ? 'Open' : 'Paid'}`,
            domain: 'invoice',
          })),
          nextCursor: offset + size < count ? String(offset + size) : null,
        };
      },
    };

    const result = await scanCustomFieldCandidatesV2(source, {
      pageSize: 777,
      maxTrackedLabels: 16,
      maxTrackedDomains: 4,
      maxTrackedLabelsPerDomain: 4,
      maxFinalists: 8,
    });

    expect(itemsRead).toBe(100_000);
    expect(result).toMatchObject({
      documentsScanned: 50_000,
    });
    expect(result.diagnostics.scan).toMatchObject({
      complete: true,
      labelPassDocuments: 50_000,
      profilePassDocuments: 50_000,
      peakState: {
        trackedLabels: 1,
        trackedDomains: 1,
        profiledLabels: 1,
        valuesPerLabel: 2,
      },
    });
  });

  it('offers a safe compatibility projection without restoring OCR examples', async () => {
    const { source } = pageSource(documents(3, () => 'Payment Status: Paid'));
    const result = await scanCustomFieldCandidatesV2(source, { minimumGlobalDocuments: 3 });

    const legacy = adaptCustomFieldDiscoveryV2ToLegacy(result);

    expect(legacy).toMatchObject({
      documentsScanned: 3,
      documentsWithOcr: 3,
      minimumDocumentCount: 3,
      candidates: [
        expect.objectContaining({
          name: 'Payment Status',
          examples: [],
        }),
      ],
    });
  });
});
