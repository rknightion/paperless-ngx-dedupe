import type { AiConfig } from './types.js';

export type AiField = 'title' | 'correspondent' | 'documentType' | 'tags';

export interface GateEvaluation {
  /** Whether every suggested field meets its configured confidence threshold. */
  passes: boolean;
  /** Fields that meet their confidence threshold. */
  fieldsPassing: AiField[];
  /** Fields that fail their confidence threshold. */
  fieldsFailing: AiField[];
  /** Human-readable reasons for confidence failures. */
  reasons: string[];
}

export interface GateInput {
  confidence: { title: number; correspondent: number; documentType: number; tags: number } | null;
  suggestedTitle: string | null;
  suggestedCorrespondent: string | null;
  suggestedDocumentType: string | null;
  suggestedTags: string[];
}

/** Evaluate configured confidence thresholds for human review. */
export function evaluateGates(config: AiConfig, input: GateInput): GateEvaluation {
  const fieldsPassing: AiField[] = [];
  const fieldsFailing: AiField[] = [];
  const reasons: string[] = [];
  const thresholds: Record<AiField, number> = {
    title: Math.max(config.confidenceThresholdGlobal, config.confidenceThresholdTitle),
    correspondent: Math.max(
      config.confidenceThresholdGlobal,
      config.confidenceThresholdCorrespondent,
    ),
    documentType: Math.max(
      config.confidenceThresholdGlobal,
      config.confidenceThresholdDocumentType,
    ),
    tags: Math.max(config.confidenceThresholdGlobal, config.confidenceThresholdTags),
  };
  const fieldsToCheck: AiField[] = [];
  if (input.suggestedTitle != null) fieldsToCheck.push('title');
  if (input.suggestedCorrespondent != null) fieldsToCheck.push('correspondent');
  if (input.suggestedDocumentType != null) fieldsToCheck.push('documentType');
  if (input.suggestedTags.length > 0) fieldsToCheck.push('tags');

  if (input.confidence == null) {
    for (const field of fieldsToCheck) {
      fieldsFailing.push(field);
      reasons.push(`No confidence data available for ${field}`);
    }
  } else {
    for (const field of fieldsToCheck) {
      const score = input.confidence[field] ?? 0;
      const threshold = thresholds[field];
      if (score >= threshold) {
        fieldsPassing.push(field);
      } else {
        fieldsFailing.push(field);
        reasons.push(
          `${field} confidence ${score.toFixed(2)} below threshold ${threshold.toFixed(2)}`,
        );
      }
    }
  }

  return { passes: fieldsFailing.length === 0, fieldsPassing, fieldsFailing, reasons };
}
