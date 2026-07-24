import { createHmac } from 'node:crypto';
import type { PaperlessCustomFieldDataType } from '../paperless/types.js';

export const CUSTOM_FIELD_DISCOVERY_ALGORITHM_VERSION = 'custom-field-discovery-v2';
const MAX_CURSOR_HASHES = 64;
const MAX_PATTERN_SHAPES = 32;
const OCR_YIELD_CHARACTERS = 64 * 1_024;
const STATE_CEILINGS = {
  pageSize: 5_000,
  maxCandidates: 100,
  maxLabelsPerDocument: 512,
  maxTrackedLabels: 2_048,
  maxTrackedDomains: 128,
  maxTrackedLabelsPerDomain: 128,
  maxFinalists: 2_048,
  maxSelectOptions: 100,
  cardinalityCap: 4_096,
} as const;

const FIRST_CLASS_FIELDS = new Set([
  'title',
  'correspondent',
  'document type',
  'tags',
  'tag',
  'created',
  'created date',
  'added',
  'added date',
  'modified',
  'modified date',
  'document date',
  'date',
  'storage path',
  'archive serial number',
]);

const FIELD_PATTERN = /^\s*([\p{L}][\p{L}\p{N}\p{M} /&()_-]{1,39})\s*:\s*(\S.{0,199})\s*$/u;
const IDENTIFIER_LABEL =
  /\b(?:account|card|customer|email|iban|national insurance|nhs|phone|policy|reference|sort code|tax id)\b/i;
const MONETARY_VALUE =
  /^(?:(?:GBP|EUR|USD|CAD|AUD|CHF|JPY)\s*|[£$€]\s*)-?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/;
const SENSITIVE_VALUE =
  /(?:\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\d)(?:\+?\d[\s()/-]?){8,18}\d(?!\d))/iu;
const SECRET_LABEL =
  /\b(?:access token|api key|passcode|password|private key|secret|security answer)\b/iu;
const HTTP_URL_VALUE = /^https?:\/\/[^\s/$.?#].[^\s]*$/iu;
const SAFE_SELECT_VALUES = new Set([
  'accepted',
  'active',
  'approved',
  'cancelled',
  'closed',
  'complete',
  'declined',
  'draft',
  'inactive',
  'incomplete',
  'open',
  'overdue',
  'paid',
  'pending',
  'rejected',
  'unpaid',
]);

export type CustomFieldCandidateDataTypeV2 = Exclude<PaperlessCustomFieldDataType, 'documentlink'>;

export type CustomFieldDiscoveryRiskV2 =
  'invalid_date' | 'monetary_value' | 'high_cardinality' | 'sensitive_value';

export type CustomFieldDiscoveryTruncationV2 =
  | 'label_capacity'
  | 'document_label_capacity'
  | 'domain_capacity'
  | 'domain_label_capacity'
  | 'finalist_capacity'
  | 'candidate_capacity'
  | 'option_capacity'
  | 'pattern_capacity'
  | 'cardinality'
  | 'source_count_mismatch'
  | 'source_changed';

export interface CustomFieldDiscoverySourceItemV2 {
  /** OCR is consumed for this page only and is never included in a result. */
  ocrText: string | null;
  /** A bounded grouping key such as document type. It must not be a document identifier. */
  domain?: string | null;
}

export interface CustomFieldDiscoverySourceSnapshotV2 {
  /** Stable hash of the source snapshot and discovery-relevant configuration. */
  fingerprint: string;
  capturedAt: string;
  documentCount: number;
}

export interface CustomFieldDiscoveryPageRequestV2 {
  pass: 'labels' | 'profiles';
  cursor: string | null;
  limit: number;
  sourceFingerprint: string;
}

export interface CustomFieldDiscoveryPageV2 {
  items: readonly CustomFieldDiscoverySourceItemV2[];
  /** Opaque keyset cursor. Null means the snapshot has been completely scanned. */
  nextCursor: string | null;
}

export interface CustomFieldDiscoveryPageSourceV2 {
  /** Secret 32-byte-or-longer hex token used only to key opaque public identifiers. */
  opaqueToken: string;
  snapshot: CustomFieldDiscoverySourceSnapshotV2;
  readPage(request: CustomFieldDiscoveryPageRequestV2): Promise<CustomFieldDiscoveryPageV2>;
  /** Optional cheap staleness check performed after both passes. */
  readCurrentFingerprint?(): Promise<string>;
}

export interface CustomFieldDiscoveryOptionsV2 {
  existingFieldNames?: readonly string[];
  pageSize?: number;
  maxCandidates?: number;
  maxLabelsPerDocument?: number;
  maxTrackedLabels?: number;
  maxTrackedDomains?: number;
  maxTrackedLabelsPerDomain?: number;
  maxFinalists?: number;
  maxSelectOptions?: number;
  cardinalityCap?: number;
  minimumGlobalDocuments?: number;
  minimumGlobalCoverage?: number;
  minimumDomainDocuments?: number;
  minimumDomainCoverage?: number;
  signal?: AbortSignal;
}

export interface CustomFieldCandidateV2 {
  /** Stable opaque key derived from the normalized label, never a document ID. */
  key: string;
  name: string;
  recommendedDataType: CustomFieldCandidateDataTypeV2;
  recommendation: 'recommended' | 'review_carefully';
  documentCount: number;
  matchCount: number;
  coverage: number;
  confidence: number;
  utilityScore: number;
  valueProfile: {
    distinctEstimate: {
      lowerBound: number;
      capped: boolean;
    };
    patternShapes: Array<{ shape: string; matchCount: number }>;
    selectOptions?: Array<{ value: string; documentCount: number }>;
  };
  strongestDomain?: {
    domainId: string;
    documentCount: number;
    domainDocumentsWithOcr: number;
    coverage: number;
  };
  risks: CustomFieldDiscoveryRiskV2[];
  truncation: CustomFieldDiscoveryTruncationV2[];
  rationale: string;
  recommendedGuidance: string;
}

export interface CustomFieldDiscoveryRunV2 {
  runKey: string;
  algorithmVersion: typeof CUSTOM_FIELD_DISCOVERY_ALGORITHM_VERSION;
  status: 'completed' | 'incomplete';
  phase: 'complete' | 'incomplete';
  documentsScanned: number;
  documentsWithOcr: number;
  sourceFingerprint: string;
  stale: boolean;
  truncatedLabelSpace: boolean;
  candidates: CustomFieldCandidateV2[];
  diagnostics: {
    source: CustomFieldDiscoverySourceSnapshotV2;
    thresholds: {
      minimumGlobalDocuments: number;
      minimumGlobalCoverage: number;
      minimumDomainDocuments: number;
      minimumDomainCoverage: number;
    };
    scan: {
      complete: boolean;
      labelPassDocuments: number;
      profilePassDocuments: number;
      truncation: CustomFieldDiscoveryTruncationV2[];
      bounds: {
        pageSize: number;
        maxCandidates: number;
        maxLabelsPerDocument: number;
        maxTrackedLabels: number;
        maxTrackedDomains: number;
        maxTrackedLabelsPerDomain: number;
        maxFinalists: number;
        maxSelectOptions: number;
        cardinalityCap: number;
        maxCursorHashes: number;
      };
      peakState: {
        trackedLabels: number;
        trackedDomains: number;
        trackedDomainLabels: number;
        labelsPerDocument: number;
        profiledLabels: number;
        valuesPerLabel: number;
        cursorHashes: number;
        selectOptionsPerCandidate: number;
      };
    };
  };
}

interface CounterEntry {
  count: number;
}

/** Misra-Gries lower-bound counter with a hard key bound. */
class BoundedCounter {
  readonly entries = new Map<string, CounterEntry>();
  truncated = false;
  totalUpdates = 0;

  constructor(readonly capacity: number) {}

  increment(key: string): readonly string[] {
    this.totalUpdates++;
    const current = this.entries.get(key);
    if (current) {
      current.count++;
      return [];
    }
    if (this.entries.size < this.capacity) {
      this.entries.set(key, { count: 1 });
      return [];
    }

    this.truncated = true;
    const removed: string[] = [];
    for (const [candidate, entry] of this.entries) {
      entry.count--;
      if (entry.count === 0) {
        this.entries.delete(candidate);
        removed.push(candidate);
      }
    }
    return removed;
  }
}

interface ResolvedOptions {
  pageSize: number;
  maxCandidates: number;
  maxLabelsPerDocument: number;
  maxTrackedLabels: number;
  maxTrackedDomains: number;
  maxTrackedLabelsPerDomain: number;
  maxFinalists: number;
  maxSelectOptions: number;
  cardinalityCap: number;
  minimumGlobalDocuments?: number;
  minimumGlobalCoverage: number;
  minimumDomainDocuments: number;
  minimumDomainCoverage: number;
}

interface LabelPass {
  documents: number;
  documentsWithOcr: number;
  globalLabels: BoundedCounter;
  domains: BoundedCounter;
  labelsByDomain: Map<string, BoundedCounter>;
}

interface ValueStats {
  total: number;
  boolean: number;
  monetary: number;
  monetaryObserved: number;
  integer: number;
  float: number;
  validDate: number;
  invalidDate: number;
  url: number;
  sensitive: number;
  totalLength: number;
}

interface Profile {
  documentCount: number;
  matchCount: number;
  domainDocuments: Map<string, number>;
  values: Map<string, number>;
  cardinalityCapped: boolean;
  ambiguousDocuments: number;
  typeEvidenceTruncated: boolean;
  patternShapes: BoundedCounter;
  stats: ValueStats;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function stateBoundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  name: keyof typeof STATE_CEILINGS,
): number {
  const resolved = positiveInteger(value, fallback, name);
  const maximum = STATE_CEILINGS[name];
  if (resolved > maximum) {
    throw new RangeError(`${name} exceeds maximum ${maximum}`);
  }
  return resolved;
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertValidOpaqueToken(value: string): void {
  if (!/^[a-f0-9]{64,}$/i.test(value) || value.length % 2 !== 0) {
    throw new Error('Custom-field discovery opaque token must contain at least 32 bytes of hex');
  }
}

function keyedHash(opaqueToken: string, value: string, length: number): string {
  return createHmac('sha256', Buffer.from(opaqueToken, 'hex'))
    .update(value)
    .digest('hex')
    .slice(0, length);
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 && normalized.length <= 80 ? normalized : null;
}

function displayLabel(normalized: string): string {
  return normalized
    .split(' ')
    .map((part) => {
      const [first = '', ...rest] = [...part];
      return first.toUpperCase() + rest.join('');
    })
    .join(' ');
}

async function forEachLine(
  text: string,
  visit: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let start = 0;
  let nextYieldAt = OCR_YIELD_CHARACTERS;
  for (let index = 0; index <= text.length; index++) {
    if (index >= nextYieldAt) {
      signal?.throwIfAborted();
      await new Promise<void>((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
      nextYieldAt += OCR_YIELD_CHARACTERS;
    }
    if (index === text.length || text.charCodeAt(index) === 10) {
      signal?.throwIfAborted();
      const end = index > start && text.charCodeAt(index - 1) === 13 ? index - 1 : index;
      visit(text.slice(start, end));
      start = index + 1;
    }
  }
}

async function parseFields(
  text: string,
  existingNames: ReadonlySet<string>,
  visit: (label: string, value: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  await forEachLine(
    text,
    (line) => {
      const match = line.normalize('NFKC').match(FIELD_PATTERN);
      if (!match) return;
      const label = normalizeLabel(match[1]);
      const value = match[2].trim();
      if (
        FIRST_CLASS_FIELDS.has(label) ||
        existingNames.has(label) ||
        SENSITIVE_VALUE.test(label) ||
        SECRET_LABEL.test(label) ||
        value.length === 0 ||
        /^[\p{P}\p{S}\s_]+$/u.test(value)
      ) {
        return;
      }
      visit(label, value);
    },
    signal,
  );
}

async function collectDocumentLabels(
  text: string,
  existingNames: ReadonlySet<string>,
  capacity: number,
  opaqueToken: string,
  signal?: AbortSignal,
): Promise<{ labels: Set<string>; truncated: boolean }> {
  const hashMask = (1n << 64n) - 1n;
  let hashXor = 0n;
  let hashSum = 0n;
  let fieldCount = 0;
  await parseFields(
    text,
    existingNames,
    (label) => {
      const labelHash = BigInt(`0x${keyedHash(opaqueToken, `document-label\0${label}`, 16)}`);
      hashXor ^= labelHash;
      hashSum = (hashSum + labelHash) & hashMask;
      fieldCount++;
    },
    signal,
  );
  const documentSalt = `${hashXor.toString(16).padStart(16, '0')}${hashSum
    .toString(16)
    .padStart(16, '0')}:${fieldCount}`;
  const selected = new Map<string, string>();
  let truncated = false;
  await parseFields(
    text,
    existingNames,
    (label) => {
      if (selected.has(label)) return;
      const score = keyedHash(opaqueToken, `document-sample\0${documentSalt}\0${label}`, 32);
      if (selected.size < capacity) {
        selected.set(label, score);
        return;
      }
      truncated = true;
      const [worstLabel, worstScore] = [...selected.entries()].sort(
        ([leftLabel, leftScore], [rightLabel, rightScore]) =>
          compareStrings(rightScore, leftScore) || compareStrings(rightLabel, leftLabel),
      )[0];
      if (
        compareStrings(score, worstScore) < 0 ||
        (score === worstScore && compareStrings(label, worstLabel) < 0)
      ) {
        selected.delete(worstLabel);
        selected.set(label, score);
      }
    },
    signal,
  );
  return { labels: new Set(selected.keys()), truncated };
}

function isValidDateValue(value: string): boolean {
  let year: number;
  let month: number;
  let day: number;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!local) return false;
    day = Number(local[1]);
    month = Number(local[2]);
    year = Number(local[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function looksDateShaped(value: string): boolean {
  return /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})$/.test(value);
}

function valuePatternShape(value: string): string {
  if (isValidDateValue(value)) {
    return value.includes('-') && value.indexOf('-') === 4 ? 'date:iso' : 'date:local';
  }
  if (looksDateShaped(value)) return 'date:invalid';
  if (MONETARY_VALUE.test(value)) return 'monetary';
  if (HTTP_URL_VALUE.test(value)) return 'url';
  if (/^(?:true|false|yes|no)$/i.test(value)) return 'boolean';
  if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value)) return 'email';
  if (/^-?\d+$/.test(value)) return 'integer';
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return 'decimal';
  const lengthBucket =
    value.length <= 8
      ? 'short'
      : value.length <= 32
        ? 'medium'
        : value.length <= 128
          ? 'long'
          : 'xl';
  if (/^[A-Za-z\s]+$/.test(value)) return `letters:${lengthBucket}`;
  if (/^[A-Za-z0-9\s_-]+$/.test(value)) return `alphanumeric:${lengthBucket}`;
  return `mixed:${lengthBucket}`;
}

interface DocumentValueObservation {
  boolean: number;
  monetary: number;
  integer: number;
  float: number;
  validDate: number;
  invalidDate: number;
  url: number;
  sensitive: number;
  totalLength: number;
  values: number;
  shapes: BoundedCounter;
}

function createDocumentValueObservation(): DocumentValueObservation {
  return {
    boolean: 0,
    monetary: 0,
    integer: 0,
    float: 0,
    validDate: 0,
    invalidDate: 0,
    url: 0,
    sensitive: 0,
    totalLength: 0,
    values: 0,
    shapes: new BoundedCounter(MAX_PATTERN_SHAPES),
  };
}

function observeDocumentValue(observation: DocumentValueObservation, value: string): void {
  observation.values++;
  observation.totalLength += value.length;
  if (/^(?:true|false|yes|no)$/i.test(value)) observation.boolean++;
  if (MONETARY_VALUE.test(value)) observation.monetary++;
  if (/^-?\d+$/.test(value)) observation.integer++;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) observation.float++;
  if (isValidDateValue(value)) observation.validDate++;
  if (!isValidDateValue(value) && looksDateShaped(value)) observation.invalidDate++;
  if (HTTP_URL_VALUE.test(value)) observation.url++;
  if (SENSITIVE_VALUE.test(value)) observation.sensitive++;
  observation.shapes.increment(valuePatternShape(value));
}

function commitDocumentObservation(profile: Profile, observation: DocumentValueObservation): void {
  const stats = profile.stats;
  stats.total++;
  const dominant = (count: number) => ratio(count, observation.values) >= 0.8;
  const hasDominantType =
    dominant(observation.boolean) ||
    dominant(observation.monetary) ||
    dominant(observation.integer) ||
    dominant(observation.float) ||
    dominant(observation.validDate) ||
    dominant(observation.url);
  const hasTypedSignal =
    observation.boolean +
      observation.monetary +
      observation.integer +
      observation.float +
      observation.validDate +
      observation.url >
    0;
  if (dominant(observation.boolean)) stats.boolean++;
  if (dominant(observation.monetary)) stats.monetary++;
  if (observation.monetary > 0) stats.monetaryObserved++;
  if (dominant(observation.integer)) stats.integer++;
  if (dominant(observation.float)) stats.float++;
  if (dominant(observation.validDate)) stats.validDate++;
  if (observation.invalidDate > 0) stats.invalidDate++;
  if (dominant(observation.url)) stats.url++;
  if (observation.sensitive > 0) stats.sensitive++;
  if (hasTypedSignal && !hasDominantType) profile.ambiguousDocuments++;
  stats.totalLength += observation.values === 0 ? 0 : observation.totalLength / observation.values;
  for (const [shape, { count }] of observation.shapes.entries) {
    for (let index = 0; index < count; index++) profile.patternShapes.increment(shape);
  }
  profile.typeEvidenceTruncated ||= observation.shapes.truncated;
}

function observeDistinctValue(profile: Profile, value: string, cardinalityCap: number): void {
  if (profile.values.has(value)) return;
  if (profile.values.size < cardinalityCap + 1) {
    profile.values.set(value, 0);
    if (profile.values.size > cardinalityCap) profile.cardinalityCapped = true;
    return;
  }

  profile.cardinalityCapped = true;
  const greatest = [...profile.values.keys()].sort(compareStrings).at(-1)!;
  if (compareStrings(value, greatest) < 0) {
    profile.values.delete(greatest);
    profile.values.set(value, 0);
  }
}

async function readAllPages(
  source: CustomFieldDiscoveryPageSourceV2,
  pass: CustomFieldDiscoveryPageRequestV2['pass'],
  pageSize: number,
  expectedDocuments: number,
  sourceFingerprint: string,
  opaqueToken: string,
  signal: AbortSignal | undefined,
  cursorPeaks: { peak: number },
  visit: (item: CustomFieldDiscoverySourceItemV2) => void | Promise<void>,
): Promise<number> {
  let cursor: string | null = null;
  let documents = 0;
  const seenCursorHashes = new Set<string>();
  const cursorHashOrder: string[] = [];
  do {
    signal?.throwIfAborted();
    const page = await source.readPage({
      pass,
      cursor,
      limit: pageSize,
      sourceFingerprint,
    });
    signal?.throwIfAborted();
    if (!page || !Array.isArray(page.items)) {
      throw new Error('Custom-field discovery source returned an invalid page');
    }
    if (page.items.length > pageSize) {
      throw new Error(`Custom-field discovery source returned more than ${pageSize} items`);
    }
    if (documents + page.items.length > expectedDocuments) {
      throw new Error('Custom-field discovery source returned more documents than the snapshot');
    }
    for (const item of page.items) {
      signal?.throwIfAborted();
      await visit(item);
      documents++;
    }
    if (
      page.nextCursor !== null &&
      (typeof page.nextCursor !== 'string' ||
        page.nextCursor.length < 1 ||
        page.nextCursor.length > 2_000 ||
        /[\p{Cc}\p{Cf}]/u.test(page.nextCursor))
    ) {
      throw new Error('Custom-field discovery source returned an invalid cursor');
    }
    if (page.nextCursor !== null) {
      const cursorHash = keyedHash(opaqueToken, `cursor\0${page.nextCursor}`, 32);
      if (seenCursorHashes.has(cursorHash)) {
        throw new Error('Custom-field discovery source cursor cycle detected');
      }
      seenCursorHashes.add(cursorHash);
      cursorHashOrder.push(cursorHash);
      if (cursorHashOrder.length > MAX_CURSOR_HASHES) {
        seenCursorHashes.delete(cursorHashOrder.shift()!);
      }
      cursorPeaks.peak = Math.max(cursorPeaks.peak, seenCursorHashes.size);
    }
    if (page.items.length === 0 && page.nextCursor !== null) {
      throw new Error('Custom-field discovery source returned an empty non-terminal page');
    }
    if (documents === expectedDocuments && page.nextCursor !== null) {
      throw new Error('Custom-field discovery source continued after the snapshot document count');
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  return documents;
}

function assertValidSnapshot(snapshot: CustomFieldDiscoverySourceSnapshotV2): void {
  if (
    !snapshot ||
    typeof snapshot.fingerprint !== 'string' ||
    snapshot.fingerprint.length < 1 ||
    snapshot.fingerprint.length > 512 ||
    /[\p{Cc}\p{Cf}]/u.test(snapshot.fingerprint) ||
    typeof snapshot.capturedAt !== 'string' ||
    !Number.isSafeInteger(snapshot.documentCount) ||
    snapshot.documentCount < 0
  ) {
    throw new Error('Invalid custom-field discovery source snapshot');
  }
  const capturedAt = new Date(snapshot.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.toISOString() !== snapshot.capturedAt) {
    throw new Error('Invalid custom-field discovery source snapshot timestamp');
  }
}

function assertValidCurrentFingerprint(value: string): void {
  if (value.length < 1 || value.length > 512 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error('Invalid current custom-field discovery source fingerprint');
  }
}

function resolveOptions(options: CustomFieldDiscoveryOptionsV2): ResolvedOptions {
  const cardinalityCap = stateBoundedPositiveInteger(options.cardinalityCap, 128, 'cardinalityCap');
  const maxSelectOptions = stateBoundedPositiveInteger(
    options.maxSelectOptions,
    20,
    'maxSelectOptions',
  );
  if (maxSelectOptions > cardinalityCap) {
    throw new RangeError('maxSelectOptions must not exceed cardinalityCap');
  }
  return {
    pageSize: stateBoundedPositiveInteger(options.pageSize, 500, 'pageSize'),
    maxCandidates: stateBoundedPositiveInteger(options.maxCandidates, 25, 'maxCandidates'),
    maxLabelsPerDocument: stateBoundedPositiveInteger(
      options.maxLabelsPerDocument,
      128,
      'maxLabelsPerDocument',
    ),
    maxTrackedLabels: stateBoundedPositiveInteger(
      options.maxTrackedLabels,
      256,
      'maxTrackedLabels',
    ),
    maxTrackedDomains: stateBoundedPositiveInteger(
      options.maxTrackedDomains,
      32,
      'maxTrackedDomains',
    ),
    maxTrackedLabelsPerDomain: stateBoundedPositiveInteger(
      options.maxTrackedLabelsPerDomain,
      64,
      'maxTrackedLabelsPerDomain',
    ),
    maxFinalists: stateBoundedPositiveInteger(options.maxFinalists, 128, 'maxFinalists'),
    maxSelectOptions,
    cardinalityCap,
    minimumGlobalDocuments:
      options.minimumGlobalDocuments === undefined
        ? undefined
        : positiveInteger(options.minimumGlobalDocuments, 3, 'minimumGlobalDocuments'),
    minimumGlobalCoverage: options.minimumGlobalCoverage ?? 0.01,
    minimumDomainDocuments: positiveInteger(
      options.minimumDomainDocuments,
      3,
      'minimumDomainDocuments',
    ),
    minimumDomainCoverage: options.minimumDomainCoverage ?? 0.2,
  };
}

function assertCoverage(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function selectFinalists(
  pass: LabelPass,
  options: ResolvedOptions,
): {
  labels: string[];
  truncated: boolean;
} {
  const estimates = new Map<string, number>();
  for (const [label, entry] of pass.globalLabels.entries) {
    estimates.set(label, ratio(entry.count, pass.documentsWithOcr));
  }
  for (const [domain, labels] of pass.labelsByDomain) {
    const domainCount = pass.domains.entries.get(domain)?.count ?? 0;
    for (const [label, entry] of labels.entries) {
      estimates.set(label, Math.max(estimates.get(label) ?? 0, ratio(entry.count, domainCount)));
    }
  }
  const ranked = [...estimates.entries()].sort(
    ([leftLabel, left], [rightLabel, right]) =>
      right - left || compareStrings(leftLabel, rightLabel),
  );
  return {
    labels: ranked.slice(0, options.maxFinalists).map(([label]) => label),
    truncated: ranked.length > options.maxFinalists,
  };
}

function inferType(
  normalizedName: string,
  profile: Profile,
  options: ResolvedOptions,
): {
  dataType: CustomFieldCandidateDataTypeV2;
  confidence: number;
  mixedEvidence: boolean;
} {
  const { stats } = profile;
  const identifier = IDENTIFIER_LABEL.test(normalizedName);
  if (!identifier && ratio(stats.validDate, stats.total) >= 0.8) {
    return { dataType: 'date', confidence: 0.95, mixedEvidence: false };
  }
  if (!identifier && ratio(stats.boolean, stats.total) >= 0.8) {
    return { dataType: 'boolean', confidence: 0.95, mixedEvidence: false };
  }
  if (!identifier && ratio(stats.url, stats.total) >= 0.8) {
    return { dataType: 'url', confidence: 0.95, mixedEvidence: false };
  }
  if (ratio(stats.monetary, stats.total) >= 0.8) {
    return { dataType: 'monetary', confidence: 0.8, mixedEvidence: false };
  }
  if (!identifier && ratio(stats.integer, stats.total) >= 0.9) {
    return { dataType: 'integer', confidence: 0.9, mixedEvidence: false };
  }
  if (!identifier && ratio(stats.float, stats.total) >= 0.9) {
    return { dataType: 'float', confidence: 0.9, mixedEvidence: false };
  }
  const hasTypedOrUnsafeSignal =
    stats.boolean +
      stats.monetaryObserved +
      stats.integer +
      stats.float +
      stats.validDate +
      stats.invalidDate +
      stats.url +
      stats.sensitive >
    0;
  if (hasTypedOrUnsafeSignal || profile.ambiguousDocuments > 0 || profile.typeEvidenceTruncated) {
    return { dataType: 'string', confidence: 0.55, mixedEvidence: true };
  }
  if (
    !profile.cardinalityCapped &&
    profile.values.size >= 2 &&
    profile.values.size <= options.maxSelectOptions &&
    (profile.values.size <= 3 || ratio(profile.values.size, profile.documentCount) <= 0.2)
  ) {
    return { dataType: 'select', confidence: 0.85, mixedEvidence: false };
  }
  return ratio(stats.totalLength, stats.total) > 128
    ? { dataType: 'longtext', confidence: 0.75, mixedEvidence: false }
    : { dataType: 'string', confidence: 0.75, mixedEvidence: false };
}

function risksFor(normalizedName: string, profile: Profile): CustomFieldDiscoveryRiskV2[] {
  const risks: CustomFieldDiscoveryRiskV2[] = [];
  if (profile.stats.invalidDate > 0) risks.push('invalid_date');
  if (profile.stats.monetaryObserved > 0) risks.push('monetary_value');
  if (
    profile.cardinalityCapped ||
    (profile.values.size >= 5 && ratio(profile.values.size, profile.documentCount) >= 0.5)
  ) {
    risks.push('high_cardinality');
  }
  if (IDENTIFIER_LABEL.test(normalizedName) || profile.stats.sensitive > 0) {
    risks.push('sensitive_value');
  }
  return risks;
}

function guidanceFor(risks: readonly CustomFieldDiscoveryRiskV2[]): string {
  if (risks.includes('sensitive_value')) {
    return 'Confirm this identifier is necessary before creating a field; keep sensitive values out of discovery output.';
  }
  if (risks.includes('monetary_value')) {
    return 'Confirm the value is a transaction amount, not a balance, rate, or unrelated currency figure.';
  }
  if (risks.includes('invalid_date')) {
    return 'Review invalid calendar values and date conventions before creating a date field.';
  }
  if (risks.includes('high_cardinality')) {
    return 'Confirm a searchable string field is useful despite the high number of distinct values.';
  }
  return 'Review the aggregate support and inferred type before creating this Paperless custom field.';
}

function utilityScore(
  confidence: number,
  coverage: number,
  strongestDomainCoverage: number,
  risks: readonly CustomFieldDiscoveryRiskV2[],
): number {
  const support = Math.max(coverage, strongestDomainCoverage);
  const score = confidence * (0.6 + support * 0.4) - risks.length * 0.05;
  return Math.round(Math.max(0, Math.min(1, score)) * 10_000) / 10_000;
}

function hasOnlySafeSelectValues(profile: Profile): boolean {
  return [...profile.values.keys()].every((value) =>
    SAFE_SELECT_VALUES.has(value.trim().toLowerCase()),
  );
}

function counterProvesHeavyHitter(counter: BoundedCounter, exactCount: number): boolean {
  return !counter.truncated || exactCount > counter.totalUpdates / (counter.capacity + 1);
}

function strongestDomain(
  profile: Profile,
  domainTotals: ReadonlyMap<string, CounterEntry>,
  opaqueToken: string,
):
  | { domain: string; publicValue: NonNullable<CustomFieldCandidateV2['strongestDomain']> }
  | undefined {
  const ranked = [...profile.domainDocuments.entries()]
    .map(([domain, documentCount]) => {
      const domainDocumentsWithOcr = domainTotals.get(domain)?.count ?? 0;
      return {
        domain,
        publicValue: {
          domainId: keyedHash(opaqueToken, `domain\0${domain}`, 24),
          documentCount,
          domainDocumentsWithOcr,
          coverage: ratio(documentCount, domainDocumentsWithOcr),
        },
      };
    })
    .sort(
      (left, right) =>
        right.publicValue.coverage - left.publicValue.coverage ||
        right.publicValue.documentCount - left.publicValue.documentCount ||
        compareStrings(left.publicValue.domainId, right.publicValue.domainId),
    );
  return ranked[0];
}

/**
 * Deterministic bounded two-pass discovery over an immutable keyset snapshot.
 *
 * Pass one keeps only approximate heavy-hitter label counters. Pass two computes
 * exact aggregate profiles for the bounded finalist set. OCR and source cursors
 * never escape the source/scanner boundary.
 */
export async function scanCustomFieldCandidatesV2(
  source: CustomFieldDiscoveryPageSourceV2,
  rawOptions: CustomFieldDiscoveryOptionsV2 = {},
): Promise<CustomFieldDiscoveryRunV2> {
  assertValidOpaqueToken(source.opaqueToken);
  const opaqueToken = source.opaqueToken;
  assertValidSnapshot(source.snapshot);
  const snapshot: CustomFieldDiscoverySourceSnapshotV2 = { ...source.snapshot };
  rawOptions.signal?.throwIfAborted();
  const options = resolveOptions(rawOptions);
  assertCoverage(options.minimumGlobalCoverage, 'minimumGlobalCoverage');
  assertCoverage(options.minimumDomainCoverage, 'minimumDomainCoverage');
  const existingNames = new Set((rawOptions.existingFieldNames ?? []).map(normalizeLabel));
  const truncation = new Set<CustomFieldDiscoveryTruncationV2>();
  const labelPass: LabelPass = {
    documents: 0,
    documentsWithOcr: 0,
    globalLabels: new BoundedCounter(options.maxTrackedLabels),
    domains: new BoundedCounter(options.maxTrackedDomains),
    labelsByDomain: new Map(),
  };
  let peakTrackedLabels = 0;
  let peakTrackedDomains = 0;
  let peakTrackedDomainLabels = 0;
  let peakLabelsPerDocument = 0;
  let documentLabelCapacityReached = false;
  const cursorPeaks = { peak: 0 };

  labelPass.documents = await readAllPages(
    source,
    'labels',
    options.pageSize,
    snapshot.documentCount,
    snapshot.fingerprint,
    opaqueToken,
    rawOptions.signal,
    cursorPeaks,
    async (item) => {
      if (!item.ocrText?.trim()) return;
      labelPass.documentsWithOcr++;
      const selection = await collectDocumentLabels(
        item.ocrText,
        existingNames,
        options.maxLabelsPerDocument,
        opaqueToken,
        rawOptions.signal,
      );
      const documentLabels = selection.labels;
      documentLabelCapacityReached ||= selection.truncated;
      peakLabelsPerDocument = Math.max(peakLabelsPerDocument, documentLabels.size);
      for (const label of documentLabels) labelPass.globalLabels.increment(label);

      const domain = normalizeDomain(item.domain);
      if (domain) {
        const evictedDomains = labelPass.domains.increment(domain);
        for (const evictedDomain of evictedDomains) {
          labelPass.labelsByDomain.delete(evictedDomain);
        }
        if (labelPass.domains.entries.has(domain)) {
          let domainLabels = labelPass.labelsByDomain.get(domain);
          if (!domainLabels) {
            domainLabels = new BoundedCounter(options.maxTrackedLabelsPerDomain);
            labelPass.labelsByDomain.set(domain, domainLabels);
          }
          for (const label of documentLabels) domainLabels.increment(label);
        }
      }

      peakTrackedLabels = Math.max(peakTrackedLabels, labelPass.globalLabels.entries.size);
      peakTrackedDomains = Math.max(peakTrackedDomains, labelPass.domains.entries.size);
      peakTrackedDomainLabels = Math.max(
        peakTrackedDomainLabels,
        [...labelPass.labelsByDomain.values()].reduce(
          (total, counter) => total + counter.entries.size,
          0,
        ),
      );
    },
  );

  if (labelPass.globalLabels.truncated) truncation.add('label_capacity');
  if (documentLabelCapacityReached) truncation.add('document_label_capacity');
  if (labelPass.domains.truncated) truncation.add('domain_capacity');
  if ([...labelPass.labelsByDomain.values()].some(({ truncated }) => truncated)) {
    truncation.add('domain_label_capacity');
  }

  const finalistSelection = selectFinalists(labelPass, options);
  if (finalistSelection.truncated) truncation.add('finalist_capacity');
  const finalists = new Set(finalistSelection.labels);
  const profiles = new Map<string, Profile>(
    finalistSelection.labels.map((label) => [
      label,
      {
        documentCount: 0,
        matchCount: 0,
        domainDocuments: new Map(),
        values: new Map(),
        cardinalityCapped: false,
        ambiguousDocuments: 0,
        typeEvidenceTruncated: false,
        patternShapes: new BoundedCounter(MAX_PATTERN_SHAPES),
        stats: {
          total: 0,
          boolean: 0,
          monetary: 0,
          monetaryObserved: 0,
          integer: 0,
          float: 0,
          validDate: 0,
          invalidDate: 0,
          url: 0,
          sensitive: 0,
          totalLength: 0,
        },
      },
    ]),
  );
  let peakValuesPerLabel = 0;
  let profileDocumentsWithOcr = 0;
  const trackedDomains = new Set(labelPass.domains.entries.keys());
  const exactDomainTotals = new Map<string, CounterEntry>();

  const profilePassDocuments = await readAllPages(
    source,
    'profiles',
    options.pageSize,
    snapshot.documentCount,
    snapshot.fingerprint,
    opaqueToken,
    rawOptions.signal,
    cursorPeaks,
    async (item) => {
      if (!item.ocrText?.trim()) return;
      profileDocumentsWithOcr++;
      const matchedLabels = new Set<string>();
      const valuesByLabel = new Map<string, Set<string>>();
      const truncatedTypeLabels = new Set<string>();
      await parseFields(
        item.ocrText,
        existingNames,
        (label, value) => {
          if (!finalists.has(label)) return;
          const profile = profiles.get(label)!;
          profile.matchCount++;
          matchedLabels.add(label);

          let documentValues = valuesByLabel.get(label);
          if (!documentValues) {
            documentValues = new Set();
            valuesByLabel.set(label, documentValues);
          }
          if (documentValues.has(value)) return;
          if (documentValues.size < options.cardinalityCap + 1) {
            documentValues.add(value);
            return;
          }
          truncatedTypeLabels.add(label);
          const greatest = [...documentValues].sort(compareStrings).at(-1)!;
          if (compareStrings(value, greatest) < 0) {
            documentValues.delete(greatest);
            documentValues.add(value);
          }
        },
        rawOptions.signal,
      );

      const domain = normalizeDomain(item.domain);
      if (domain && trackedDomains.has(domain)) {
        const total = exactDomainTotals.get(domain) ?? { count: 0 };
        total.count++;
        exactDomainTotals.set(domain, total);
      }
      for (const label of matchedLabels) {
        const profile = profiles.get(label)!;
        profile.documentCount++;
        const observation = createDocumentValueObservation();
        for (const value of valuesByLabel.get(label) ?? []) {
          observeDocumentValue(observation, value);
        }
        profile.typeEvidenceTruncated ||= truncatedTypeLabels.has(label);
        commitDocumentObservation(profile, observation);
        if (domain && trackedDomains.has(domain)) {
          profile.domainDocuments.set(domain, (profile.domainDocuments.get(domain) ?? 0) + 1);
        }
        for (const value of valuesByLabel.get(label) ?? []) {
          observeDistinctValue(profile, value, options.cardinalityCap);
          if (profile.values.has(value)) {
            profile.values.set(value, (profile.values.get(value) ?? 0) + 1);
          }
        }
        peakValuesPerLabel = Math.max(peakValuesPerLabel, profile.values.size);
      }
    },
  );

  const minimumGlobalDocuments =
    options.minimumGlobalDocuments ??
    Math.max(3, Math.ceil(labelPass.documentsWithOcr * options.minimumGlobalCoverage));
  const candidates: CustomFieldCandidateV2[] = [];
  for (const [normalizedName, profile] of profiles) {
    const coverage = ratio(profile.documentCount, labelPass.documentsWithOcr);
    const strongestDomainSupport = strongestDomain(profile, exactDomainTotals, opaqueToken);
    const domain = strongestDomainSupport?.publicValue;
    const globalHeavyHitterProven = counterProvesHeavyHitter(
      labelPass.globalLabels,
      profile.documentCount,
    );
    const domainLabelCounter = strongestDomainSupport
      ? labelPass.labelsByDomain.get(strongestDomainSupport.domain)
      : undefined;
    const domainIdentityProven =
      domain !== undefined &&
      counterProvesHeavyHitter(labelPass.domains, domain.domainDocumentsWithOcr);
    const domainHeavyHitterProven =
      domain !== undefined &&
      domainIdentityProven &&
      ((!labelPass.domains.truncated &&
        domainLabelCounter !== undefined &&
        counterProvesHeavyHitter(domainLabelCounter, domain.documentCount)) ||
        (labelPass.domains.truncated && globalHeavyHitterProven));
    const globallySupported =
      globalHeavyHitterProven &&
      profile.documentCount >= minimumGlobalDocuments &&
      coverage >= options.minimumGlobalCoverage;
    const domainSupported =
      domainHeavyHitterProven &&
      domain !== undefined &&
      domain.documentCount >= options.minimumDomainDocuments &&
      domain.coverage >= options.minimumDomainCoverage;
    if (!globallySupported && !domainSupported) continue;

    const inferred = inferType(normalizedName, profile, options);
    const risks = risksFor(normalizedName, profile);
    const candidateTruncation: CustomFieldDiscoveryTruncationV2[] = [];
    if (profile.cardinalityCapped) {
      candidateTruncation.push('cardinality');
      truncation.add('cardinality');
    }
    if (profile.values.size > options.maxSelectOptions) {
      candidateTruncation.push('option_capacity');
      truncation.add('option_capacity');
    }
    if (profile.patternShapes.truncated) {
      candidateTruncation.push('pattern_capacity');
      truncation.add('pattern_capacity');
    }
    const name = displayLabel(normalizedName);
    const ambiguityRatio = ratio(profile.ambiguousDocuments, profile.documentCount);
    const typeTrust = profile.typeEvidenceTruncated ? 0.5 : Math.max(0.5, 1 - ambiguityRatio * 0.5);
    const confidence = Math.min(
      1,
      inferred.confidence * typeTrust * 0.75 + Math.min(coverage, 0.25),
    );
    const approximateLabelSpace =
      labelPass.globalLabels.truncated ||
      documentLabelCapacityReached ||
      labelPass.domains.truncated ||
      [...labelPass.labelsByDomain.values()].some(({ truncated }) => truncated) ||
      finalistSelection.truncated;
    const selectOptions =
      inferred.dataType === 'select' &&
      !risks.includes('sensitive_value') &&
      hasOnlySafeSelectValues(profile)
        ? [...profile.values.entries()]
            .map(([value, documentCount]) => ({ value, documentCount }))
            .sort(
              (left, right) =>
                right.documentCount - left.documentCount || compareStrings(left.value, right.value),
            )
        : undefined;
    const candidate: CustomFieldCandidateV2 = {
      key: keyedHash(opaqueToken, `candidate\0${normalizedName}`, 24),
      name,
      recommendedDataType: inferred.dataType,
      recommendation:
        risks.length === 0 &&
        !inferred.mixedEvidence &&
        profile.ambiguousDocuments === 0 &&
        !profile.typeEvidenceTruncated &&
        !approximateLabelSpace
          ? 'recommended'
          : 'review_carefully',
      documentCount: profile.documentCount,
      matchCount: profile.matchCount,
      coverage,
      confidence,
      utilityScore: utilityScore(confidence, coverage, domain?.coverage ?? 0, risks),
      valueProfile: {
        distinctEstimate: {
          lowerBound: profile.values.size,
          capped: profile.cardinalityCapped,
        },
        patternShapes: [...profile.patternShapes.entries.entries()]
          .map(([shape, { count: matchCount }]) => ({ shape, matchCount }))
          .sort(
            (left, right) =>
              right.matchCount - left.matchCount || compareStrings(left.shape, right.shape),
          ),
        ...(selectOptions ? { selectOptions } : {}),
      },
      strongestDomain: domain,
      risks,
      truncation: candidateTruncation,
      rationale: `${name} appears in ${profile.documentCount} OCR documents (${Math.round(
        coverage * 100,
      )}% corpus coverage) with aggregate values consistent with ${inferred.dataType}.`,
      recommendedGuidance: guidanceFor(risks),
    };
    candidates.push(candidate);
  }

  candidates.sort(
    (left, right) =>
      right.documentCount - left.documentCount ||
      right.confidence - left.confidence ||
      compareStrings(left.name, right.name),
  );
  if (candidates.length > options.maxCandidates) truncation.add('candidate_capacity');
  const selectedCandidates = candidates.slice(0, options.maxCandidates);
  const peakSelectOptionsPerCandidate = selectedCandidates.reduce(
    (peak, candidate) => Math.max(peak, candidate.valueProfile.selectOptions?.length ?? 0),
    0,
  );

  const sourceCountMatches =
    labelPass.documents === snapshot.documentCount &&
    profilePassDocuments === snapshot.documentCount &&
    labelPass.documents === profilePassDocuments &&
    labelPass.documentsWithOcr === profileDocumentsWithOcr;
  if (!sourceCountMatches) truncation.add('source_count_mismatch');
  rawOptions.signal?.throwIfAborted();
  const currentFingerprint = await source.readCurrentFingerprint?.();
  rawOptions.signal?.throwIfAborted();
  if (currentFingerprint !== undefined) assertValidCurrentFingerprint(currentFingerprint);
  const snapshotChanged =
    source.opaqueToken !== opaqueToken ||
    source.snapshot.fingerprint !== snapshot.fingerprint ||
    source.snapshot.capturedAt !== snapshot.capturedAt ||
    source.snapshot.documentCount !== snapshot.documentCount;
  const stale =
    (currentFingerprint !== undefined && currentFingerprint !== snapshot.fingerprint) ||
    snapshotChanged ||
    !sourceCountMatches;
  if (
    (currentFingerprint !== undefined && currentFingerprint !== snapshot.fingerprint) ||
    snapshotChanged
  ) {
    truncation.add('source_changed');
  }
  const truncationList = [...truncation].sort();
  const truncatedLabelSpace = truncationList.some((reason) =>
    [
      'label_capacity',
      'document_label_capacity',
      'domain_capacity',
      'domain_label_capacity',
      'finalist_capacity',
    ].includes(reason),
  );
  const runKey = keyedHash(
    opaqueToken,
    JSON.stringify({
      algorithmVersion: CUSTOM_FIELD_DISCOVERY_ALGORITHM_VERSION,
      sourceFingerprint: snapshot.fingerprint,
      options,
      existingFieldNames: [...existingNames].sort(compareStrings),
    }),
    32,
  );
  const publicSourceFingerprint = keyedHash(opaqueToken, `source\0${snapshot.fingerprint}`, 32);

  return {
    runKey,
    algorithmVersion: CUSTOM_FIELD_DISCOVERY_ALGORITHM_VERSION,
    status: stale ? 'incomplete' : 'completed',
    phase: stale ? 'incomplete' : 'complete',
    documentsScanned: labelPass.documents,
    documentsWithOcr: labelPass.documentsWithOcr,
    sourceFingerprint: publicSourceFingerprint,
    stale,
    truncatedLabelSpace,
    candidates: stale ? [] : selectedCandidates,
    diagnostics: {
      source: {
        ...snapshot,
        fingerprint: publicSourceFingerprint,
      },
      thresholds: {
        minimumGlobalDocuments,
        minimumGlobalCoverage: options.minimumGlobalCoverage,
        minimumDomainDocuments: options.minimumDomainDocuments,
        minimumDomainCoverage: options.minimumDomainCoverage,
      },
      scan: {
        complete: !stale,
        labelPassDocuments: labelPass.documents,
        profilePassDocuments,
        truncation: truncationList,
        bounds: {
          pageSize: options.pageSize,
          maxCandidates: options.maxCandidates,
          maxLabelsPerDocument: options.maxLabelsPerDocument,
          maxTrackedLabels: options.maxTrackedLabels,
          maxTrackedDomains: options.maxTrackedDomains,
          maxTrackedLabelsPerDomain: options.maxTrackedLabelsPerDomain,
          maxFinalists: options.maxFinalists,
          maxSelectOptions: options.maxSelectOptions,
          cardinalityCap: options.cardinalityCap,
          maxCursorHashes: MAX_CURSOR_HASHES,
        },
        peakState: {
          trackedLabels: peakTrackedLabels,
          trackedDomains: peakTrackedDomains,
          trackedDomainLabels: peakTrackedDomainLabels,
          labelsPerDocument: peakLabelsPerDocument,
          profiledLabels: profiles.size,
          valuesPerLabel: peakValuesPerLabel,
          cursorHashes: cursorPeaks.peak,
          selectOptionsPerCandidate: peakSelectOptionsPerCandidate,
        },
      },
    },
  };
}

export interface LegacyCustomFieldDiscoveryProjection {
  documentsScanned: number;
  documentsWithOcr: number;
  minimumDocumentCount: number;
  candidates: Array<{
    name: string;
    dataType: CustomFieldCandidateDataTypeV2;
    documentCount: number;
    matchCount: number;
    coverage: number;
    confidence: number;
    examples: never[];
    selectOptions?: string[];
    rationale: string;
  }>;
}

/**
 * Temporary projection for callers migrating from the synchronous discovery API.
 * It intentionally leaves `examples` empty so compatibility cannot reintroduce
 * persisted OCR snippets.
 */
export function adaptCustomFieldDiscoveryV2ToLegacy(
  run: CustomFieldDiscoveryRunV2,
): LegacyCustomFieldDiscoveryProjection {
  if (run.status !== 'completed' || run.stale || !run.diagnostics.scan.complete) {
    throw new Error('Cannot project an incomplete or stale custom-field discovery run');
  }
  return {
    documentsScanned: run.documentsScanned,
    documentsWithOcr: run.documentsWithOcr,
    minimumDocumentCount: run.diagnostics.thresholds.minimumGlobalDocuments,
    candidates: run.candidates.map((candidate) => ({
      name: candidate.name,
      dataType: candidate.recommendedDataType,
      documentCount: candidate.documentCount,
      matchCount: candidate.matchCount,
      coverage: candidate.coverage,
      confidence: candidate.confidence,
      examples: [],
      ...(candidate.valueProfile.selectOptions
        ? { selectOptions: candidate.valueProfile.selectOptions.map(({ value }) => value) }
        : {}),
      rationale: candidate.rationale,
    })),
  };
}
