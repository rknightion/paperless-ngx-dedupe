import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { document, documentContent } from '../schema/sqlite/documents.js';
import type { PaperlessCustomFieldDataType } from '../paperless/types.js';

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

export interface CustomFieldCandidate {
  name: string;
  dataType: Exclude<PaperlessCustomFieldDataType, 'documentlink'>;
  documentCount: number;
  matchCount: number;
  coverage: number;
  confidence: number;
  examples: string[];
  selectOptions?: string[];
  rationale: string;
}

export interface CustomFieldDiscoveryResult {
  documentsScanned: number;
  documentsWithOcr: number;
  minimumDocumentCount: number;
  candidates: CustomFieldCandidate[];
}

export interface CustomFieldDiscoveryOptions {
  existingFieldNames?: string[];
  maxCandidates?: number;
  minimumDocumentCount?: number;
}

interface ObservedField {
  displayNames: Map<string, number>;
  values: Map<string, number>;
  documentIds: Set<string>;
  matchCount: number;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayLabel(observed: ObservedField): string {
  const [mostFrequent] = [...observed.displayNames.entries()].sort(
    ([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || leftName.localeCompare(rightName),
  )[0];
  return mostFrequent
    .split(/\s+/)
    .map((part) => {
      if (/^[A-Z0-9]{2,}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function ratioMatching(values: string[], predicate: (value: string) => boolean): number {
  return values.length === 0 ? 0 : values.filter(predicate).length / values.length;
}

function inferType(values: string[]): {
  dataType: CustomFieldCandidate['dataType'];
  confidence: number;
} {
  if (
    ratioMatching(values, (value) =>
      /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/.test(value),
    ) >= 0.8
  ) {
    return { dataType: 'date', confidence: 0.95 };
  }

  if (ratioMatching(values, (value) => /^(?:true|false|yes|no)$/i.test(value)) >= 0.8) {
    return { dataType: 'boolean', confidence: 0.95 };
  }

  if (
    ratioMatching(values, (value) =>
      /^(?:(?:GBP|EUR|USD|CAD|AUD|CHF|JPY)\s*|[£$€]\s*)-?\d[\d,]*(?:\.\d{1,2})?$/.test(value),
    ) >= 0.8
  ) {
    return { dataType: 'monetary', confidence: 0.85 };
  }

  if (ratioMatching(values, (value) => /^-?\d+$/.test(value)) >= 0.9) {
    return { dataType: 'integer', confidence: 0.9 };
  }

  if (ratioMatching(values, (value) => /^-?\d+(?:\.\d+)?$/.test(value)) >= 0.9) {
    return { dataType: 'float', confidence: 0.9 };
  }

  const uniqueValues = new Set(values);
  if (
    uniqueValues.size >= 2 &&
    uniqueValues.size <= 12 &&
    (uniqueValues.size <= 3 || uniqueValues.size / values.length <= 0.2)
  ) {
    return { dataType: 'select', confidence: 0.85 };
  }

  const averageLength =
    values.length === 0
      ? 0
      : values.reduce((total, value) => total + value.length, 0) / values.length;
  return averageLength > 128
    ? { dataType: 'longtext', confidence: 0.75 }
    : { dataType: 'string', confidence: 0.75 };
}

export function discoverCustomFieldCandidates(
  db: AppDatabase,
  options: CustomFieldDiscoveryOptions = {},
): CustomFieldDiscoveryResult {
  const rows = db
    .select({ documentId: document.id, fullText: documentContent.fullText })
    .from(document)
    .leftJoin(documentContent, eq(document.id, documentContent.documentId))
    .all();

  const documentsWithOcr = rows.filter((row) => Boolean(row.fullText?.trim())).length;
  const minimumDocumentCount =
    options.minimumDocumentCount ?? Math.max(3, Math.ceil(documentsWithOcr * 0.01));
  const existingNames = new Set((options.existingFieldNames ?? []).map(normalizeLabel));
  const observed = new Map<string, ObservedField>();
  const fieldPattern = /^\s*([A-Za-z][A-Za-z0-9 /&()_-]{1,39})\s*:\s*(\S.{0,199})\s*$/;

  for (const row of rows) {
    if (!row.fullText) continue;
    for (const line of row.fullText.split(/\r?\n/)) {
      const match = line.match(fieldPattern);
      if (!match) continue;

      const rawLabel = match[1].trim();
      const label = normalizeLabel(rawLabel);
      const value = match[2].trim();
      if (
        FIRST_CLASS_FIELDS.has(label) ||
        existingNames.has(label) ||
        value.length === 0 ||
        /^[\W_]+$/.test(value)
      ) {
        continue;
      }

      const entry = observed.get(label) ?? {
        displayNames: new Map<string, number>(),
        values: new Map<string, number>(),
        documentIds: new Set<string>(),
        matchCount: 0,
      };
      entry.displayNames.set(rawLabel, (entry.displayNames.get(rawLabel) ?? 0) + 1);
      entry.values.set(value, (entry.values.get(value) ?? 0) + 1);
      entry.documentIds.add(row.documentId);
      entry.matchCount++;
      observed.set(label, entry);
    }
  }

  const candidates = [...observed.values()]
    .filter((entry) => entry.documentIds.size >= minimumDocumentCount)
    .map((entry): CustomFieldCandidate => {
      const expandedValues = [...entry.values.entries()].flatMap(([value, count]) =>
        Array.from({ length: count }, () => value),
      );
      const inferred = inferType(expandedValues);
      const rankedValues = [...entry.values.entries()].sort(
        ([leftValue, leftCount], [rightValue, rightCount]) =>
          rightCount - leftCount || leftValue.localeCompare(rightValue),
      );
      const coverage = documentsWithOcr === 0 ? 0 : entry.documentIds.size / documentsWithOcr;
      const name = displayLabel(entry);
      const candidate: CustomFieldCandidate = {
        name,
        dataType: inferred.dataType,
        documentCount: entry.documentIds.size,
        matchCount: entry.matchCount,
        coverage,
        confidence: Math.min(1, inferred.confidence * 0.7 + Math.min(coverage, 0.3)),
        examples: rankedValues.slice(0, 5).map(([value]) => value),
        rationale: `${name} appears in ${entry.documentIds.size} OCR documents (${Math.round(
          coverage * 100,
        )}% coverage) with values consistent with ${inferred.dataType}.`,
      };
      if (inferred.dataType === 'select') {
        candidate.selectOptions = rankedValues.map(([value]) => value).sort();
      }
      return candidate;
    })
    .sort(
      (left, right) =>
        right.documentCount - left.documentCount ||
        right.confidence - left.confidence ||
        left.name.localeCompare(right.name),
    )
    .slice(0, options.maxCandidates ?? 25);

  return {
    documentsScanned: rows.length,
    documentsWithOcr,
    minimumDocumentCount,
    candidates,
  };
}
