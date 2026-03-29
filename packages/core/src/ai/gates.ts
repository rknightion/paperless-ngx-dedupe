import type { AiConfig } from './types.js';

export type AiField = 'title' | 'correspondent' | 'documentType' | 'tags';

export interface GateEvaluation {
  /** Whether the result passes all mandatory gates */
  passes: boolean;
  /** Fields that meet their confidence threshold */
  fieldsPassing: AiField[];
  /** Fields that fail their confidence threshold */
  fieldsFailing: AiField[];
  /** Human-readable reasons for gate failures */
  reasons: string[];
  /** Whether this result is eligible for auto-apply (passes + auto-apply criteria) */
  autoApplyEligible: boolean;
  /** Reasons auto-apply was blocked (empty if eligible) */
  autoApplyBlockReasons: string[];
}

export interface GateInput {
  confidence: { title: number; correspondent: number; documentType: number; tags: number } | null;
  suggestedTitle: string | null;
  suggestedCorrespondent: string | null;
  suggestedDocumentType: string | null;
  suggestedTags: string[];
  currentTitle: string | null;
  currentCorrespondent: string | null;
  currentDocumentType: string | null;
  currentTags: string[];
  hasOcrText: boolean;
}

export interface GateContext {
  existingCorrespondentNames: Set<string>;
  existingDocTypeNames: Set<string>;
  existingTagNames: Set<string>;
}

/**
 * Evaluate whether an AI result passes all configured confidence gates
 * and whether it is eligible for auto-apply.
 */
export function evaluateGates(
  config: AiConfig,
  input: GateInput,
  context: GateContext,
): GateEvaluation {
  const fieldsPassing: AiField[] = [];
  const fieldsFailing: AiField[] = [];
  const reasons: string[] = [];
  const autoApplyBlockReasons: string[] = [];

  // 1. Compute effective threshold per field
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

  // 2. Check each field's confidence against its effective threshold
  const fieldsToCheck: AiField[] = [];
  if (input.suggestedTitle != null) fieldsToCheck.push('title');
  if (input.suggestedCorrespondent != null) fieldsToCheck.push('correspondent');
  if (input.suggestedDocumentType != null) fieldsToCheck.push('documentType');
  if (input.suggestedTags.length > 0) fieldsToCheck.push('tags');

  if (input.confidence == null) {
    // All fields with suggestions fail when confidence is null
    for (const field of fieldsToCheck) {
      fieldsFailing.push(field);
      reasons.push(`No confidence data available for ${field}`);
    }
  } else {
    for (const field of fieldsToCheck) {
      const score = (input.confidence as Record<string, number>)[field] ?? 0;
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

  // 3. neverAutoCreateEntities gate
  if (config.neverAutoCreateEntities) {
    if (
      input.suggestedCorrespondent != null &&
      !context.existingCorrespondentNames.has(input.suggestedCorrespondent.toLowerCase())
    ) {
      if (!fieldsFailing.includes('correspondent')) {
        fieldsFailing.push('correspondent');
        const idx = fieldsPassing.indexOf('correspondent');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(
        `Correspondent "${input.suggestedCorrespondent}" does not exist and entity creation is blocked`,
      );
    }

    if (
      input.suggestedDocumentType != null &&
      !context.existingDocTypeNames.has(input.suggestedDocumentType.toLowerCase())
    ) {
      if (!fieldsFailing.includes('documentType')) {
        fieldsFailing.push('documentType');
        const idx = fieldsPassing.indexOf('documentType');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(
        `Document type "${input.suggestedDocumentType}" does not exist and entity creation is blocked`,
      );
    }

    const newTags = input.suggestedTags.filter(
      (t) => !context.existingTagNames.has(t.toLowerCase()),
    );
    if (newTags.length > 0) {
      if (!fieldsFailing.includes('tags')) {
        fieldsFailing.push('tags');
        const idx = fieldsPassing.indexOf('tags');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(`Tags [${newTags.join(', ')}] do not exist and entity creation is blocked`);
    }
  }

  // 4. neverOverwriteNonEmpty gate
  if (config.neverOverwriteNonEmpty) {
    if (
      input.currentTitle != null &&
      input.suggestedTitle != null &&
      input.currentTitle.toLowerCase() !== input.suggestedTitle.toLowerCase()
    ) {
      if (!fieldsFailing.includes('title')) {
        fieldsFailing.push('title');
        const idx = fieldsPassing.indexOf('title');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(
        `Title would overwrite existing value "${input.currentTitle}" with "${input.suggestedTitle}"`,
      );
    }

    if (
      input.currentCorrespondent != null &&
      input.suggestedCorrespondent != null &&
      input.currentCorrespondent.toLowerCase() !== input.suggestedCorrespondent.toLowerCase()
    ) {
      if (!fieldsFailing.includes('correspondent')) {
        fieldsFailing.push('correspondent');
        const idx = fieldsPassing.indexOf('correspondent');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(
        `Correspondent would overwrite existing value "${input.currentCorrespondent}" with "${input.suggestedCorrespondent}"`,
      );
    }

    if (
      input.currentDocumentType != null &&
      input.suggestedDocumentType != null &&
      input.currentDocumentType.toLowerCase() !== input.suggestedDocumentType.toLowerCase()
    ) {
      if (!fieldsFailing.includes('documentType')) {
        fieldsFailing.push('documentType');
        const idx = fieldsPassing.indexOf('documentType');
        if (idx !== -1) fieldsPassing.splice(idx, 1);
      }
      reasons.push(
        `Document type would overwrite existing value "${input.currentDocumentType}" with "${input.suggestedDocumentType}"`,
      );
    }

    if (input.currentTags.length > 0 && input.suggestedTags.length > 0) {
      const currentSet = new Set(input.currentTags.map((t) => t.toLowerCase()));
      const suggestedSet = new Set(input.suggestedTags.map((t) => t.toLowerCase()));
      const tagsChanged =
        input.suggestedTags.length !== input.currentTags.length ||
        input.suggestedTags.some((t) => !currentSet.has(t.toLowerCase())) ||
        input.currentTags.some((t) => !suggestedSet.has(t.toLowerCase()));
      if (tagsChanged) {
        if (!fieldsFailing.includes('tags')) {
          fieldsFailing.push('tags');
          const idx = fieldsPassing.indexOf('tags');
          if (idx !== -1) fieldsPassing.splice(idx, 1);
        }
        reasons.push('Tags would overwrite existing non-empty tag set');
      }
    }
  }

  // 5. tagsOnlyAutoApply gate
  if (config.tagsOnlyAutoApply) {
    for (const field of ['title', 'correspondent', 'documentType'] as const) {
      if (fieldsPassing.includes(field)) {
        const idx = fieldsPassing.indexOf(field);
        if (idx !== -1) fieldsPassing.splice(idx, 1);
        if (!fieldsFailing.includes(field)) {
          fieldsFailing.push(field);
        }
        reasons.push(`${field} excluded by tags-only auto-apply mode`);
      }
    }
  }

  const passes = fieldsFailing.length === 0;

  // 6. Auto-apply eligibility evaluation
  let autoApplyEligible = config.autoApplyEnabled && passes;

  if (config.autoApplyEnabled) {
    if (!passes) {
      autoApplyBlockReasons.push('Result does not pass all gates');
      autoApplyEligible = false;
    }

    if (config.autoApplyRequireAllAboveThreshold && fieldsFailing.length > 0) {
      // Already captured by !passes above, but add specific reason
      if (!autoApplyBlockReasons.length) {
        autoApplyBlockReasons.push('Not all fields meet their confidence threshold');
      }
      autoApplyEligible = false;
    }

    if (config.autoApplyRequireNoNewEntities) {
      const hasNewEntities = checkForNewEntities(input, context);
      if (hasNewEntities) {
        autoApplyBlockReasons.push('Result would create new entities');
        autoApplyEligible = false;
      }
    }

    if (config.autoApplyRequireNoClearing) {
      const wouldClear = checkForClearing(input);
      if (wouldClear) {
        autoApplyBlockReasons.push('Result would clear existing values');
        autoApplyEligible = false;
      }
    }

    if (config.autoApplyRequireOcrText && !input.hasOcrText) {
      autoApplyBlockReasons.push('Document has no OCR text');
      autoApplyEligible = false;
    }
  } else {
    autoApplyBlockReasons.push('Auto-apply is not enabled');
    autoApplyEligible = false;
  }

  return {
    passes,
    fieldsPassing,
    fieldsFailing,
    reasons,
    autoApplyEligible,
    autoApplyBlockReasons,
  };
}

/** Check whether any suggested entity does not exist in the known entity sets. */
function checkForNewEntities(input: GateInput, context: GateContext): boolean {
  if (
    input.suggestedCorrespondent != null &&
    !context.existingCorrespondentNames.has(input.suggestedCorrespondent.toLowerCase())
  ) {
    return true;
  }
  if (
    input.suggestedDocumentType != null &&
    !context.existingDocTypeNames.has(input.suggestedDocumentType.toLowerCase())
  ) {
    return true;
  }
  for (const tag of input.suggestedTags) {
    if (!context.existingTagNames.has(tag.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** Check whether applying suggestions would clear an existing non-null/non-empty value. */
function checkForClearing(input: GateInput): boolean {
  // Title clearing is not applicable — Paperless requires a title, so we never clear it
  if (input.suggestedCorrespondent == null && input.currentCorrespondent != null) {
    return true;
  }
  if (input.suggestedDocumentType == null && input.currentDocumentType != null) {
    return true;
  }
  if (input.suggestedTags.length === 0 && input.currentTags.length > 0) {
    return true;
  }
  return false;
}
