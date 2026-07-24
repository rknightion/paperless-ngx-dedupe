import { describe, expect, it } from 'vitest';

import {
  aiReviewHref,
  libraryHref,
  qualitySummaryHref,
  removeLibraryFilterHref,
  scalarSubmitInsightKeys,
} from './document-library-links';

const query = {
  text: 'invoice',
  missingOcr: false,
  missingCorrespondent: true,
  correspondentSet: ['Acme Limited', 'Acme Ltd'],
  documentTypeSet: ['Invoice', 'Receipt'],
  tagSet: ['finance', 'tax'],
  customFieldId: 7,
  customFieldValue: [1, 2],
  duplicate: 'involved' as const,
  aiStatus: 'failed',
  freshness: 'stale' as const,
  cursor: 'do-not-copy',
  limit: 25 as const,
};

describe('document library links', () => {
  it('retains the canonical active population while stripping pagination', () => {
    const href = new URL(libraryHref(query), 'http://localhost');

    expect(href.pathname).toBe('/documents');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      library: 'true',
      text: 'invoice',
      missingOcr: 'false',
      missingCorrespondent: 'true',
      correspondentSet: '["Acme Limited","Acme Ltd"]',
      documentTypeSet: '["Invoice","Receipt"]',
      tagSet: '["finance","tax"]',
      customFieldId: '7',
      customFieldValue: '[1,2]',
      duplicate: 'involved',
      aiStatus: 'failed',
      freshness: 'stale',
    });
  });

  it('replaces only the selected quality dimension and clears its conflicting siblings', () => {
    const href = new URL(
      libraryHref(query, {
        dimension: 'correspondent',
        values: { correspondent: 'Acme PLC' },
      }),
      'http://localhost',
    );

    expect(href.searchParams.get('correspondent')).toBe('Acme PLC');
    expect(href.searchParams.has('missingCorrespondent')).toBe(false);
    expect(href.searchParams.has('correspondentSet')).toBe(false);
    expect(href.searchParams.get('documentTypeSet')).toBe('["Invoice","Receipt"]');
    expect(href.searchParams.get('tagSet')).toBe('["finance","tax"]');
  });

  it('removes one hidden insight filter without discarding the remaining population', () => {
    const href = new URL(removeLibraryFilterHref(query, 'tagSet'), 'http://localhost');

    expect(href.searchParams.has('tagSet')).toBe(false);
    expect(href.searchParams.get('documentTypeSet')).toBe('["Invoice","Receipt"]');
    expect(href.searchParams.get('text')).toBe('invoice');
  });

  it('clears missing and set siblings only when the visible scalar is submitted', () => {
    expect(
      scalarSubmitInsightKeys({
        correspondent: 'Acme',
        documentType: '',
        tag: '',
      }),
    ).toEqual(['missingDocumentType', 'documentTypeSet', 'missingTags', 'tagSet']);
  });

  it.each([
    ['pending_review', 'review'],
    ['failed', 'failures'],
    ['skipped', 'failures'],
    ['applied', 'history'],
    ['partial', 'history'],
    ['reverted', 'history'],
    ['rejected', 'history'],
  ])('routes %s to the exact %s queue and a safe return target', (status, queue) => {
    const href = new URL(
      aiReviewHref('internal-doc-id', status, '/documents?library=true&text=invoice') ?? '',
      'http://localhost',
    );

    expect(href.pathname).toBe('/ai-processing/review');
    expect(href.searchParams.get('queue')).toBe(queue);
    expect(href.searchParams.get('documentId')).toBe('internal-doc-id');
    expect(href.searchParams.get('returnTo')).toBe('/documents?library=true&text=invoice');
  });

  it('does not create misleading or unsafe AI destinations', () => {
    expect(aiReviewHref('doc-1', null, '/documents?library=true')).toBeNull();
    expect(aiReviewHref('doc-1', 'unprocessed', '/documents?library=true')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', 'https://attacker.example')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', '//attacker.example')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', '/settings')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', '/documents-elsewhere')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', '/documents/../settings')).toBeNull();
    expect(aiReviewHref('doc-1', 'failed', '/documents%2f..%2fsettings')).toBeNull();
    expect(
      aiReviewHref('doc-1', 'failed', '/documents\nLocation:https://attacker.example'),
    ).toBeNull();
  });

  it('routes stored review conflicts to review instead of the generic failed queue', () => {
    const href = new URL(
      aiReviewHref('doc-conflict', 'failed', '/documents?library=true', 'review_conflict') ?? '',
      'http://localhost',
    );
    expect(href.searchParams.get('queue')).toBe('review');
    expect(href.searchParams.get('documentId')).toBe('doc-conflict');
  });

  it.each([
    [{ missingOcr: false }, 'missingOcr'],
    [{ duplicate: 'not-involved' }, 'duplicateInvolved'],
    [{ aiStatus: 'failed' }, 'aiUnprocessed'],
    [{ freshness: 'fresh' }, 'aiStale'],
    [{ aiStatus: 'unprocessed' }, 'aiStale'],
  ] as const)(
    'does not link an impossible opposing summary population for %j',
    (opposing, metric) => {
      expect(qualitySummaryHref({ ...query, ...opposing }, metric)).toBeNull();
    },
  );

  it('links compatible summary populations while retaining unrelated filters', () => {
    const href = new URL(
      qualitySummaryHref({ text: 'invoice', tag: 'finance' }, 'missingOcr') ?? '',
      'http://localhost',
    );
    expect(href.searchParams.get('text')).toBe('invoice');
    expect(href.searchParams.get('tag')).toBe('finance');
    expect(href.searchParams.get('missingOcr')).toBe('true');
  });
});
