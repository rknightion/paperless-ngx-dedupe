import { extractDiscriminativeTokens, type DiscriminativeTokens } from './discriminative.js';

const MAX_VALUES_PER_CATEGORY = 4;
const MAX_DISPLAY_VALUE_LENGTH = 40;

export type MatchExplanationCategory = 'date' | 'amount' | 'identifier' | 'reference' | 'route';

export interface MatchExplanationShared {
  category: MatchExplanationCategory;
  label: string;
  values: string[];
}

export interface MatchExplanationDifference {
  category: MatchExplanationCategory;
  label: string;
  primaryValues: string[];
  comparisonValues: string[];
}

export interface MatchExplanationComparison {
  documentId: string;
  shared: MatchExplanationShared[];
  differences: MatchExplanationDifference[];
}

export interface DuplicateMatchExplanation {
  primaryDocumentId: string;
  comparisons: MatchExplanationComparison[];
}

export interface MatchExplanationDocument {
  documentId: string;
  text: string | null;
}

interface CategoryDefinition {
  category: MatchExplanationCategory;
  label: string;
  tokens: keyof Pick<
    DiscriminativeTokens,
    'dates' | 'amounts' | 'identifiers' | 'references' | 'routes'
  >;
}

const CATEGORIES: readonly CategoryDefinition[] = [
  { category: 'date', label: 'Dates', tokens: 'dates' },
  { category: 'amount', label: 'Amounts', tokens: 'amounts' },
  { category: 'identifier', label: 'Identifiers', tokens: 'identifiers' },
  { category: 'reference', label: 'References', tokens: 'references' },
  { category: 'route', label: 'Routes', tokens: 'routes' },
];

function stableFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0').slice(0, 10);
}

function displayValue(category: MatchExplanationCategory, value: string): string {
  const formatted = category === 'route' ? value.replace('>', ' → ') : value;
  if (formatted.length <= MAX_DISPLAY_VALUE_LENGTH) return formatted;

  const fingerprint = stableFingerprint(formatted);
  const prefixLength = MAX_DISPLAY_VALUE_LENGTH - fingerprint.length - 2;
  return `${formatted.slice(0, prefixLength)}…#${fingerprint}`;
}

function boundedValues(category: MatchExplanationCategory, values: Iterable<string>): string[] {
  const seen = new Set<string>();
  return [...values]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_VALUES_PER_CATEGORY)
    .map((value, index) => {
      const display = displayValue(category, value);
      if (!seen.has(display)) {
        seen.add(display);
        return display;
      }

      const suffix = `~${index + 1}`;
      const uniqueDisplay = `${display.slice(0, MAX_DISPLAY_VALUE_LENGTH - suffix.length)}${suffix}`;
      seen.add(uniqueDisplay);
      return uniqueDisplay;
    });
}

function intersection(left: Set<string>, right: Set<string>): Set<string> {
  return new Set([...left].filter((value) => right.has(value)));
}

function difference(left: Set<string>, right: Set<string>): Set<string> {
  return new Set([...left].filter((value) => !right.has(value)));
}

/**
 * Build a compact, deterministic explanation for one requested duplicate group.
 *
 * OCR is reduced to the same normalized discriminative tokens used by scoring.
 * The result contains neither source text nor unbounded token collections.
 */
export function buildMatchExplanation(
  documents: readonly MatchExplanationDocument[],
  primaryDocumentId: string,
): DuplicateMatchExplanation | null {
  const primary = documents.find((document) => document.documentId === primaryDocumentId);
  if (!primary) return null;

  const primaryTokens = extractDiscriminativeTokens((primary.text ?? '').toLowerCase());
  const comparisons = documents
    .filter((document) => document.documentId !== primaryDocumentId)
    .sort((left, right) => left.documentId.localeCompare(right.documentId))
    .map((document): MatchExplanationComparison => {
      const comparisonTokens = extractDiscriminativeTokens((document.text ?? '').toLowerCase());
      const shared: MatchExplanationShared[] = [];
      const differences: MatchExplanationDifference[] = [];

      for (const definition of CATEGORIES) {
        const primaryCategory = primaryTokens[definition.tokens];
        const comparisonCategory = comparisonTokens[definition.tokens];
        const commonValues = boundedValues(
          definition.category,
          intersection(primaryCategory, comparisonCategory),
        );
        if (commonValues.length > 0) {
          shared.push({
            category: definition.category,
            label: definition.label,
            values: commonValues,
          });
        }

        const primaryValues = boundedValues(
          definition.category,
          difference(primaryCategory, comparisonCategory),
        );
        const comparisonValues = boundedValues(
          definition.category,
          difference(comparisonCategory, primaryCategory),
        );
        if (primaryValues.length > 0 || comparisonValues.length > 0) {
          differences.push({
            category: definition.category,
            label: definition.label,
            primaryValues,
            comparisonValues,
          });
        }
      }

      return { documentId: document.documentId, shared, differences };
    });

  return { primaryDocumentId, comparisons };
}
