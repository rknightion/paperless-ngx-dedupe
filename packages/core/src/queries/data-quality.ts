import type { AppDatabase } from '../db/client.js';

export type DataQualityInsightKind =
  | 'missing-correspondent'
  | 'missing-document-type'
  | 'missing-tags'
  | 'ocr-gap'
  | 'overused-tag'
  | 'near-duplicate-correspondent'
  | 'near-duplicate-document-type'
  | 'custom-field-opportunity';

export interface DataQualityInsight {
  kind: DataQualityInsightKind;
  count: number;
  label: string;
  url: string;
}

export interface DataQualityInsights {
  totalDocuments: number;
  insights: DataQualityInsight[];
}

export interface QualityLabelCount {
  label: string;
  count: number;
}

export interface NearDuplicateNameGroup extends QualityLabelCount {
  variants: string[];
  exactVariants: string[];
}

export interface NearDuplicateWork {
  comparedPairs: number;
  visitedCells: number;
}

const MAX_LABEL_LENGTH = 80;
const MAX_AGGREGATE_LABELS = 200;
const MAX_INSIGHTS_PER_AGGREGATE = 5;

const COMPANY_WORDS = new Map([
  ['co', 'company'],
  ['corp', 'corporation'],
  ['inc', 'incorporated'],
  ['ltd', 'limited'],
]);

/**
 * Produce a display-safe grouping key from classification metadata. This never
 * receives document titles or OCR content.
 */
export function normalizeQualityKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll('&', ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => COMPANY_WORDS.get(word) ?? word)
    .join(' ');
}

export function normalizeQualityLabel(value: string): string {
  return Array.from(normalizeQualityKey(value)).slice(0, MAX_LABEL_LENGTH).join('').trim();
}

function maximumDistanceAtSimilarity(longest: number): number {
  let distance = Math.floor(longest * 0.08);
  while (distance > 0 && 1 - distance / longest < 0.92) distance -= 1;
  while (1 - (distance + 1) / longest >= 0.92) distance += 1;
  return distance;
}

function boundedEditDistance(
  left: readonly string[],
  right: readonly string[],
  maximumDistance: number,
  work?: NearDuplicateWork,
): number {
  if (Math.abs(left.length - right.length) > maximumDistance) return maximumDistance + 1;

  let prefixLength = 0;
  while (
    prefixLength < left.length &&
    prefixLength < right.length &&
    left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > prefixLength &&
    rightEnd > prefixLength &&
    left[leftEnd - 1] === right[rightEnd - 1]
  ) {
    leftEnd -= 1;
    rightEnd -= 1;
  }

  const leftLength = leftEnd - prefixLength;
  const rightLength = rightEnd - prefixLength;
  if (leftLength === 0) return rightLength;
  if (rightLength === 0) return leftLength;
  if (Math.abs(leftLength - rightLength) > maximumDistance) return maximumDistance + 1;

  const beyondLimit = maximumDistance + 1;
  let previous = new Int16Array(rightLength + 1);
  let current = new Int16Array(rightLength + 1);
  previous.fill(beyondLimit);
  for (let index = 0; index <= Math.min(rightLength, maximumDistance); index += 1) {
    previous[index] = index;
  }

  for (let leftIndex = 1; leftIndex <= leftLength; leftIndex += 1) {
    current.fill(beyondLimit);
    if (leftIndex <= maximumDistance) current[0] = leftIndex;
    const firstRightIndex = Math.max(1, leftIndex - maximumDistance);
    const lastRightIndex = Math.min(rightLength, leftIndex + maximumDistance);
    let rowMinimum = current[0];

    for (let rightIndex = firstRightIndex; rightIndex <= lastRightIndex; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[prefixLength + leftIndex - 1] === right[prefixLength + rightIndex - 1] ? 0 : 1),
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
      if (work) work.visitedCells += 1;
    }

    if (rowMinimum > maximumDistance) return beyondLimit;
    [previous, current] = [current, previous];
  }

  return previous[rightLength] <= maximumDistance ? previous[rightLength] : beyondLimit;
}

function labelsAreNearDuplicates(
  leftCharacters: readonly string[],
  rightCharacters: readonly string[],
  work?: NearDuplicateWork,
): boolean {
  if (leftCharacters.length === 0 || rightCharacters.length === 0) return false;
  if (
    leftCharacters.length === rightCharacters.length &&
    leftCharacters.every((character, index) => character === rightCharacters[index])
  ) {
    return true;
  }
  if (
    leftCharacters[0] !== rightCharacters[0] ||
    Math.min(leftCharacters.length, rightCharacters.length) < 6
  ) {
    return false;
  }
  const longest = Math.max(leftCharacters.length, rightCharacters.length);
  const maximumDistance = maximumDistanceAtSimilarity(longest);
  if (Math.abs(leftCharacters.length - rightCharacters.length) > maximumDistance) return false;
  return (
    boundedEditDistance(leftCharacters, rightCharacters, maximumDistance, work) <= maximumDistance
  );
}

/**
 * Group a bounded set of high-frequency classification names. Union-find keeps
 * transitive spelling variants in one deterministic, non-overlapping group.
 */
export function pairNearDuplicateNames(
  entries: readonly QualityLabelCount[],
  limit = MAX_INSIGHTS_PER_AGGREGATE,
  work?: NearDuplicateWork,
): NearDuplicateNameGroup[] {
  const candidates = entries
    .filter(
      (entry): entry is QualityLabelCount =>
        isSafeExactMetadataValue(entry.label) && Number.isFinite(entry.count),
    )
    .map((entry) => {
      const normalized = normalizeQualityKey(entry.label);
      return {
        raw: entry.label,
        normalized,
        characters: Array.from(normalized),
        count: Math.max(0, Math.trunc(entry.count)),
      };
    })
    .filter((entry) => entry.normalized.length > 0 && entry.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count || (left.raw < right.raw ? -1 : left.raw > right.raw ? 1 : 0),
    )
    .slice(0, MAX_AGGREGATE_LABELS);
  const parents = candidates.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot)
      parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (find(left) === find(right)) continue;
      if (work) work.comparedPairs += 1;
      if (
        labelsAreNearDuplicates(candidates[left].characters, candidates[right].characters, work)
      ) {
        union(left, right);
      }
    }
  }

  const grouped = new Map<number, typeof candidates>();
  for (let index = 0; index < candidates.length; index += 1) {
    const root = find(index);
    const group = grouped.get(root) ?? [];
    group.push(candidates[index]);
    grouped.set(root, group);
  }

  return [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const ranked = [...group].sort(
        (left, right) =>
          right.count - left.count ||
          (left.normalized < right.normalized ? -1 : left.normalized > right.normalized ? 1 : 0) ||
          (left.raw < right.raw ? -1 : left.raw > right.raw ? 1 : 0),
      );
      const selected = ranked.slice(0, 10);
      return {
        label: normalizeQualityLabel(selected[0].normalized),
        count: selected.reduce((total, entry) => total + entry.count, 0),
        variants: [...new Set(selected.map((entry) => entry.normalized))].sort(),
        exactVariants: selected.map((entry) => entry.raw).sort(),
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.label < right.label ? -1 : left.label > right.label ? 1 : 0),
    )
    .slice(0, Math.max(0, Math.min(limit, MAX_INSIGHTS_PER_AGGREGATE)));
}

function libraryUrl(parameters: Readonly<Record<string, string>> = {}): string {
  const search = new URLSearchParams({ library: 'true', ...parameters });
  return `/documents?${search.toString()}`;
}

function exactSetParameter(values: readonly string[]): string {
  return JSON.stringify([...values].sort());
}

type CountRow = {
  totalDocuments: number;
  missingCorrespondent: number;
  missingDocumentType: number;
  missingTags: number;
  missingOcr: number;
  customFieldOpportunities: number;
};

function readClassificationCounts(
  db: AppDatabase,
  column: 'correspondent' | 'document_type',
): QualityLabelCount[] {
  return db.$client
    .prepare(
      `SELECT ${column} AS label, count(*) AS count
       FROM document
       WHERE length(trim(coalesce(${column}, ''))) > 0
       GROUP BY ${column}
       ORDER BY count(*) DESC, ${column} ASC
       LIMIT ?`,
    )
    .all(MAX_AGGREGATE_LABELS) as QualityLabelCount[];
}

interface TagVariantGroup extends QualityLabelCount {
  exactVariants: string[];
}

function isSafeExactMetadataValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim() &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  );
}

function countTagVariantUnion(db: AppDatabase, variants: readonly string[]): number {
  const row = db.$client
    .prepare(
      `SELECT count(*) AS count
       FROM document d
       WHERE json_valid(coalesce(d.tags_json, '[]'))
         AND EXISTS (
           SELECT 1 FROM json_each(d.tags_json) tag_union
           WHERE tag_union.type = 'text'
             AND tag_union.value IN (${variants.map(() => '?').join(', ')})
         )`,
    )
    .get(...variants) as { count: number };
  return Number(row.count);
}

function readOverusedTags(db: AppDatabase, totalDocuments: number): TagVariantGroup[] {
  if (totalDocuments === 0) return [];

  const raw = db.$client
    .prepare(
      `SELECT tag.value AS label, count(DISTINCT d.id) AS count
       FROM document d
       JOIN json_each(
         CASE WHEN json_valid(d.tags_json) AND json_type(d.tags_json) = 'array'
           THEN d.tags_json ELSE '[]' END
       ) tag
       WHERE tag.type = 'text'
       GROUP BY tag.value
       ORDER BY count(DISTINCT d.id) DESC, tag.value ASC
       LIMIT ?`,
    )
    .all(MAX_AGGREGATE_LABELS) as QualityLabelCount[];

  const combined = new Map<string, QualityLabelCount[]>();
  for (const entry of raw) {
    if (!isSafeExactMetadataValue(entry.label)) continue;
    const key = normalizeQualityKey(entry.label);
    if (!key) continue;
    const variants = combined.get(key) ?? [];
    variants.push({ label: entry.label, count: Number(entry.count) });
    combined.set(key, variants);
  }
  const minimum = Math.max(2, Math.ceil(totalDocuments * 0.5));
  return [...combined.entries()]
    .filter(([, entries]) => entries.reduce((total, entry) => total + entry.count, 0) >= minimum)
    .map(([key, entries]) => {
      const selected = entries
        .sort(
          (left, right) =>
            right.count - left.count ||
            (left.label < right.label ? -1 : left.label > right.label ? 1 : 0),
        )
        .slice(0, 10);
      const exactVariants = selected.map((entry) => entry.label).sort();
      return {
        label: normalizeQualityLabel(key),
        count: countTagVariantUnion(db, exactVariants),
        exactVariants,
      };
    })
    .filter((entry) => entry.count >= minimum)
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.label < right.label ? -1 : left.label > right.label ? 1 : 0),
    )
    .slice(0, MAX_INSIGHTS_PER_AGGREGATE);
}

export function getDataQualityInsights(db: AppDatabase): DataQualityInsights {
  const counts = db.$client
    .prepare(
      `SELECT
         count(*) AS totalDocuments,
         coalesce(sum(length(trim(coalesce(d.correspondent, ''))) = 0), 0)
           AS missingCorrespondent,
         coalesce(sum(length(trim(coalesce(d.document_type, ''))) = 0), 0)
           AS missingDocumentType,
         coalesce(sum(
           CASE WHEN json_valid(d.tags_json)
             THEN CASE WHEN json_type(d.tags_json) = 'array'
               THEN NOT EXISTS (
                 SELECT 1 FROM json_each(d.tags_json) classification_tag
                 WHERE classification_tag.type = 'text'
                   AND length(trim(classification_tag.value)) > 0
               )
               ELSE 1 END
             ELSE 1 END
         ), 0) AS missingTags,
         coalesce(sum(NOT EXISTS (
           SELECT 1 FROM document_content content
           WHERE content.document_id = d.id
             AND length(trim(coalesce(content.full_text, ''))) > 0
         )), 0) AS missingOcr,
         coalesce(sum(
           CASE WHEN NOT EXISTS (
             SELECT 1 FROM document_content opportunity_content
             WHERE opportunity_content.document_id = d.id
               AND length(trim(coalesce(opportunity_content.full_text, ''))) > 0
           )
           THEN 0
           WHEN json_valid(d.custom_fields_json)
             THEN CASE WHEN json_type(d.custom_fields_json) = 'array'
               THEN json_array_length(d.custom_fields_json) = 0 ELSE 1 END
           ELSE 1 END
         ), 0) AS customFieldOpportunities
       FROM document d`,
    )
    .get() as CountRow;

  const totalDocuments = Number(counts.totalDocuments);
  const insights: DataQualityInsight[] = [];
  const addCount = (kind: DataQualityInsightKind, count: number, label: string, url: string) => {
    if (Number(count) > 0) insights.push({ kind, count: Number(count), label, url });
  };

  addCount(
    'missing-correspondent',
    counts.missingCorrespondent,
    'missing correspondent',
    libraryUrl({ missingCorrespondent: 'true' }),
  );
  addCount(
    'missing-document-type',
    counts.missingDocumentType,
    'missing document type',
    libraryUrl({ missingDocumentType: 'true' }),
  );
  addCount('missing-tags', counts.missingTags, 'missing tags', libraryUrl({ missingTags: 'true' }));
  addCount('ocr-gap', counts.missingOcr, 'missing ocr', libraryUrl({ missingOcr: 'true' }));

  for (const tag of readOverusedTags(db, totalDocuments)) {
    insights.push({
      kind: 'overused-tag',
      count: tag.count,
      label: tag.label,
      url: libraryUrl({ tagSet: exactSetParameter(tag.exactVariants) }),
    });
  }

  for (const group of pairNearDuplicateNames(readClassificationCounts(db, 'correspondent'))) {
    insights.push({
      kind: 'near-duplicate-correspondent',
      count: group.count,
      label: group.label,
      url: libraryUrl({ correspondentSet: exactSetParameter(group.exactVariants) }),
    });
  }
  for (const group of pairNearDuplicateNames(readClassificationCounts(db, 'document_type'))) {
    insights.push({
      kind: 'near-duplicate-document-type',
      count: group.count,
      label: group.label,
      url: libraryUrl({ documentTypeSet: exactSetParameter(group.exactVariants) }),
    });
  }

  addCount(
    'custom-field-opportunity',
    counts.customFieldOpportunities,
    'documents with ocr and no custom fields',
    '/ai-processing/custom-fields',
  );

  return { totalDocuments, insights };
}
