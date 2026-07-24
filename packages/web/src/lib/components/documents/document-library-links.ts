import { safeDocumentReturnTarget } from '../../utils/safe-return';

export type DocumentLibraryLinkQuery = {
  text?: string;
  missingOcr?: boolean;
  missingCorrespondent?: boolean;
  missingDocumentType?: boolean;
  missingTags?: boolean;
  correspondent?: string;
  correspondentSet?: string[];
  documentType?: string;
  documentTypeSet?: string[];
  tag?: string;
  tagSet?: string[];
  customFieldId?: number;
  customFieldValue?: string | number | boolean | number[] | null;
  duplicate?: 'any' | 'involved' | 'not-involved';
  aiStatus?: string;
  freshness?: 'fresh' | 'stale';
  cursor?: string;
  limit?: 25 | 50 | 100;
};

type FilterDimension =
  'ocr' | 'correspondent' | 'documentType' | 'tag' | 'duplicate' | 'aiStatus' | 'freshness';
type LinkReplacement = {
  dimension: FilterDimension;
  values: Partial<DocumentLibraryLinkQuery>;
};

const PAGINATION_KEYS = new Set<keyof DocumentLibraryLinkQuery>(['cursor', 'limit']);
const DIMENSION_KEYS: Record<FilterDimension, (keyof DocumentLibraryLinkQuery)[]> = {
  ocr: ['missingOcr'],
  correspondent: ['correspondent', 'correspondentSet', 'missingCorrespondent'],
  documentType: ['documentType', 'documentTypeSet', 'missingDocumentType'],
  tag: ['tag', 'tagSet', 'missingTags'],
  duplicate: ['duplicate'],
  aiStatus: ['aiStatus'],
  freshness: ['freshness'],
};

function serializeValue(
  value: Exclude<DocumentLibraryLinkQuery[keyof DocumentLibraryLinkQuery], undefined>,
) {
  return value === null || Array.isArray(value) || typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
}

export function libraryHref(
  query: DocumentLibraryLinkQuery,
  replacement?: LinkReplacement,
): string {
  const effective = { ...query };
  if (replacement) {
    for (const key of DIMENSION_KEYS[replacement.dimension]) delete effective[key];
    Object.assign(effective, replacement.values);
  }

  const params = new URLSearchParams({ library: 'true' });
  for (const [key, value] of Object.entries(effective) as [
    keyof DocumentLibraryLinkQuery,
    DocumentLibraryLinkQuery[keyof DocumentLibraryLinkQuery],
  ][]) {
    if (
      value === undefined ||
      PAGINATION_KEYS.has(key) ||
      (key === 'duplicate' && value === 'any')
    ) {
      continue;
    }
    params.set(key, serializeValue(value));
  }
  return `/documents?${params.toString()}`;
}

export function removeLibraryFilterHref(
  query: DocumentLibraryLinkQuery,
  key: keyof DocumentLibraryLinkQuery,
): string {
  const effective = { ...query };
  delete effective[key];
  return libraryHref(effective);
}

export type QualitySummaryMetric = 'missingOcr' | 'duplicateInvolved' | 'aiUnprocessed' | 'aiStale';

export function qualitySummaryHref(
  query: DocumentLibraryLinkQuery,
  metric: QualitySummaryMetric,
): string | null {
  if (metric === 'missingOcr') {
    if (query.missingOcr === false) return null;
    return libraryHref(query, { dimension: 'ocr', values: { missingOcr: true } });
  }
  if (metric === 'duplicateInvolved') {
    if (query.duplicate === 'not-involved') return null;
    return libraryHref(query, {
      dimension: 'duplicate',
      values: { duplicate: 'involved' },
    });
  }
  if (metric === 'aiUnprocessed') {
    if (
      (query.aiStatus !== undefined && query.aiStatus !== 'unprocessed') ||
      query.freshness !== undefined
    ) {
      return null;
    }
    return libraryHref(query, {
      dimension: 'aiStatus',
      values: { aiStatus: 'unprocessed' },
    });
  }
  if (query.freshness === 'fresh' || query.aiStatus === 'unprocessed') {
    return null;
  }
  return libraryHref(query, {
    dimension: 'freshness',
    values: { freshness: 'stale' },
  });
}

export function scalarSubmitInsightKeys(values: {
  correspondent: string;
  documentType: string;
  tag: string;
}): string[] {
  const preserved: string[] = [];
  if (!values.correspondent.trim()) {
    preserved.push('missingCorrespondent', 'correspondentSet');
  }
  if (!values.documentType.trim()) {
    preserved.push('missingDocumentType', 'documentTypeSet');
  }
  if (!values.tag.trim()) preserved.push('missingTags', 'tagSet');
  return preserved;
}

function aiQueue(status: string): 'review' | 'failures' | 'history' | null {
  if (status === 'pending_review' || status === 'review_conflict') return 'review';
  if (status === 'failed' || status === 'skipped') return 'failures';
  if (['applied', 'partial', 'reverted', 'rejected'].includes(status)) return 'history';
  return null;
}

export function aiReviewHref(
  documentId: string,
  status: string | null,
  returnTo: string,
  failureType?: string | null,
): string | null {
  const queue = failureType === 'review_conflict' ? 'review' : status ? aiQueue(status) : null;
  const safeReturnTo = safeDocumentReturnTarget(returnTo);
  if (!queue || !safeReturnTo) return null;
  const params = new URLSearchParams({ queue, documentId, returnTo: safeReturnTo });
  return `/ai-processing/review?${params.toString()}`;
}
