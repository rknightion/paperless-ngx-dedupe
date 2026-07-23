import type { PaperlessCustomField, PaperlessCustomFieldValue } from '../paperless/types.js';
import type { AiCustomFieldRecommendation } from './providers/types.js';

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeValue(
  field: PaperlessCustomField,
  value: PaperlessCustomFieldValue,
): PaperlessCustomFieldValue | undefined {
  if (value === null || field.dataType === 'documentlink') return undefined;

  switch (field.dataType) {
    case 'string':
      return typeof value === 'string' && value.length <= 128 ? value : undefined;
    case 'longtext':
      return typeof value === 'string' ? value : undefined;
    case 'url':
      if (typeof value !== 'string') return undefined;
      try {
        new URL(value);
        return value;
      } catch {
        return undefined;
      }
    case 'date':
      return typeof value === 'string' && isIsoDate(value) ? value : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'integer':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= -2_147_483_648 &&
        value <= 2_147_483_647
        ? value
        : undefined;
    case 'float':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'monetary':
      return (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && /^(?:[A-Z]{3})?-?\d+(?:\.\d{1,2})?$/.test(value))
        ? value
        : undefined;
    case 'select': {
      if (typeof value !== 'string') return undefined;
      const option = field.extraData.selectOptions.find(
        (candidate) =>
          candidate.id === value || candidate.label.toLowerCase() === value.toLowerCase(),
      );
      return option?.id;
    }
  }
}

export function normalizeCustomFieldRecommendations(
  recommendations: AiCustomFieldRecommendation[],
  fields: PaperlessCustomField[],
): AiCustomFieldRecommendation[] {
  const definitions = new Map(fields.map((field) => [field.id, field]));
  const seen = new Set<number>();
  const normalized: AiCustomFieldRecommendation[] = [];

  for (const recommendation of recommendations) {
    if (seen.has(recommendation.fieldId)) continue;
    const field = definitions.get(recommendation.fieldId);
    if (!field) continue;

    const value = normalizeValue(field, recommendation.value);
    if (value === undefined) continue;

    seen.add(field.id);
    normalized.push({
      fieldId: field.id,
      fieldName: field.name,
      value,
      confidence: Math.min(1, Math.max(0, recommendation.confidence)),
      evidence: recommendation.evidence.slice(0, 500),
    });
  }

  return normalized;
}
