/**
 * Shared status-word and field-code helpers for the AI review surfaces.
 * State is a shape, a word and a colour: never colour alone.
 */
export interface AiStatusWord {
  shape: string;
  label: string;
  colorClass: string;
}

export function aiStatusWord(status: string): AiStatusWord {
  switch (status) {
    case 'pending_review':
      return { shape: '◇', label: 'Pending review', colorClass: 'text-muted' };
    case 'applied':
      return { shape: '■', label: 'Applied', colorClass: 'text-success' };
    case 'partial':
      return { shape: '◆', label: 'Partial', colorClass: 'text-warn' };
    case 'failed':
      return { shape: '●', label: 'Failed', colorClass: 'text-ember' };
    case 'skipped':
      return { shape: '◆', label: 'Skipped', colorClass: 'text-warn' };
    case 'rejected':
      return { shape: '○', label: 'Rejected', colorClass: 'text-muted' };
    case 'reverted':
      return { shape: '○', label: 'Reverted', colorClass: 'text-muted' };
    default:
      return {
        shape: '○',
        label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '),
        colorClass: 'text-muted',
      };
  }
}

interface FieldCodeSource {
  suggestedTitle: string | null;
  suggestedCorrespondent: string | null;
  suggestedDocumentType: string | null;
  suggestedTags: string[];
  suggestedCustomFields: unknown[];
}

/** Codes for the fields a result proposes. Untouched fields are omitted, never greyed. */
export function proposedFieldCodes(result: FieldCodeSource): string[] {
  const codes: string[] = [];
  if (result.suggestedTitle) codes.push('TI');
  if (result.suggestedCorrespondent) codes.push('CO');
  if (result.suggestedDocumentType) codes.push('TY');
  if (result.suggestedTags.length > 0) codes.push('TG');
  if (result.suggestedCustomFields.length > 0) codes.push('CF');
  return codes;
}

interface ConfidenceSource extends FieldCodeSource {
  suggestedCustomFields: Array<{ fieldId: number; fieldName?: string; confidence: number }>;
  confidence: {
    title: number;
    correspondent: number;
    documentType: number;
    tags: number;
  } | null;
}

/** The weakest confidence among the fields this result proposes, with the field named. */
export function weakestConfidence(
  result: ConfidenceSource,
): { score: number; field: string } | null {
  const c = result.confidence;
  const candidates: Array<{ score: number; field: string }> = [];
  if (c) {
    if (result.suggestedTitle) candidates.push({ score: c.title, field: 'title' });
    if (result.suggestedCorrespondent)
      candidates.push({ score: c.correspondent, field: 'correspondent' });
    if (result.suggestedDocumentType) candidates.push({ score: c.documentType, field: 'type' });
    if (result.suggestedTags.length > 0) candidates.push({ score: c.tags, field: 'tags' });
  }
  for (const field of result.suggestedCustomFields) {
    if (Number.isFinite(field.confidence)) {
      candidates.push({
        score: field.confidence,
        field: field.fieldName ?? `Field #${field.fieldId}`,
      });
    }
  }
  return candidates.reduce<(typeof candidates)[number] | null>(
    (min, next) => (!min || next.score < min.score ? next : min),
    null,
  );
}
