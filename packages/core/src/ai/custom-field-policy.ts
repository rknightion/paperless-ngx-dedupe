import { asc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client.js';
import type { PaperlessCustomField, PaperlessCustomFieldDataType } from '../paperless/types.js';
import { aiCustomFieldPolicy } from '../schema/sqlite/ai-custom-field-policy.js';
import { appConfig } from '../schema/sqlite/app.js';

const MAX_CUSTOM_FIELD_POLICY_SIZE = 50;
const MAX_GUIDANCE_LENGTH = 500;
const MAX_CUSTOM_FIELD_NAME_BYTES = 256;
const MAX_CUSTOM_FIELD_GUIDANCE_BYTES = 2_000;
const MAX_SELECT_OPTIONS_PER_FIELD = 100;
const MAX_SELECT_OPTION_ID_BYTES = 256;
const MAX_SELECT_OPTION_LABEL_BYTES = 256;
const MAX_DEFAULT_CURRENCY_BYTES = 16;
export const CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES = 32 * 1024;
const RENDERABLE_CUSTOM_FIELD_TYPES = new Set<PaperlessCustomFieldDataType>([
  'string',
  'url',
  'date',
  'boolean',
  'integer',
  'float',
  'monetary',
  'select',
  'longtext',
]);

const CUSTOM_FIELD_PROMPT_HEADER = `Paperless Custom Fields
Only recommend fields from this list. Omit a field when its value is not explicitly supported by the document text.
Return the field ID exactly as provided. For select fields, return the option ID, not its label or position.
Do not recommend documentlink fields. String values must be at most 128 characters; dates must use YYYY-MM-DD.`;

export type CustomFieldPolicyErrorCode =
  | 'duplicate_field'
  | 'empty_policy'
  | 'invalid_definition'
  | 'invalid_field'
  | 'invalid_guidance'
  | 'missing_field'
  | 'prompt_too_large'
  | 'renamed_field'
  | 'too_many_fields'
  | 'type_changed_field'
  | 'unknown_field'
  | 'unsupported_field';

export class CustomFieldPolicyError extends Error {
  constructor(
    readonly code: CustomFieldPolicyErrorCode,
    message: string,
    readonly fieldId?: number,
  ) {
    super(message);
    this.name = 'CustomFieldPolicyError';
  }
}

export interface CustomFieldPolicySelection {
  fieldId: number;
  guidance?: string | null;
}

export interface CustomFieldPolicyEntry {
  fieldId: number;
  fieldName: string;
  dataType: Exclude<PaperlessCustomFieldDataType, 'documentlink'>;
  guidance: string | null;
}

export type ResolvedCustomField = PaperlessCustomField & {
  guidance: string | null;
};

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function invalidDefinition(message: string, fieldId?: number): never {
  throw new CustomFieldPolicyError('invalid_definition', message, fieldId);
}

function validateRenderedCustomFields(
  fields: readonly (PaperlessCustomField & { guidance?: string | null })[],
): void {
  if (fields.length > MAX_CUSTOM_FIELD_POLICY_SIZE) {
    throw new CustomFieldPolicyError(
      'too_many_fields',
      `Select at most ${MAX_CUSTOM_FIELD_POLICY_SIZE} custom fields`,
    );
  }
  const fieldIds = new Set<number>();
  for (const field of fields) {
    if (!Number.isSafeInteger(field.id) || field.id <= 0 || fieldIds.has(field.id)) {
      invalidDefinition('Custom-field prompt definitions must have unique positive IDs', field.id);
    }
    fieldIds.add(field.id);
    if (
      typeof field.name !== 'string' ||
      field.name.length === 0 ||
      byteLength(field.name) > MAX_CUSTOM_FIELD_NAME_BYTES
    ) {
      invalidDefinition(
        `Custom-field names must be 1-${MAX_CUSTOM_FIELD_NAME_BYTES} UTF-8 bytes`,
        field.id,
      );
    }
    if (!RENDERABLE_CUSTOM_FIELD_TYPES.has(field.dataType)) {
      invalidDefinition('Custom-field type cannot be rendered', field.id);
    }
    if (
      field.guidance !== null &&
      field.guidance !== undefined &&
      (typeof field.guidance !== 'string' ||
        field.guidance.length === 0 ||
        byteLength(field.guidance) > MAX_CUSTOM_FIELD_GUIDANCE_BYTES)
    ) {
      invalidDefinition(
        `Guidance must be at most ${MAX_CUSTOM_FIELD_GUIDANCE_BYTES} UTF-8 bytes`,
        field.id,
      );
    }
    if (
      typeof field.extraData !== 'object' ||
      field.extraData === null ||
      !Array.isArray(field.extraData.selectOptions)
    ) {
      invalidDefinition('Custom-field option metadata is malformed', field.id);
    }
    if (field.extraData.selectOptions.length > MAX_SELECT_OPTIONS_PER_FIELD) {
      invalidDefinition(
        `Select fields may contain at most ${MAX_SELECT_OPTIONS_PER_FIELD} options`,
        field.id,
      );
    }
    const optionIds = new Set<string>();
    for (const option of field.extraData.selectOptions) {
      if (
        typeof option !== 'object' ||
        option === null ||
        typeof option.id !== 'string' ||
        option.id.length === 0 ||
        byteLength(option.id) > MAX_SELECT_OPTION_ID_BYTES ||
        typeof option.label !== 'string' ||
        option.label.length === 0 ||
        byteLength(option.label) > MAX_SELECT_OPTION_LABEL_BYTES
      ) {
        invalidDefinition('Select option IDs and labels are invalid or too large', field.id);
      }
      if (optionIds.has(option.id)) {
        invalidDefinition(`Select option ID "${option.id}" is duplicated`, field.id);
      }
      optionIds.add(option.id);
    }
    const currency = field.extraData.defaultCurrency;
    if (
      currency !== undefined &&
      currency !== null &&
      (typeof currency !== 'string' ||
        currency.length === 0 ||
        byteLength(currency) > MAX_DEFAULT_CURRENCY_BYTES)
    ) {
      invalidDefinition('Default currency metadata is invalid or too large', field.id);
    }
  }
}

export function renderCustomFieldPromptBlock(
  fields: readonly (PaperlessCustomField & { guidance?: string | null })[],
): string {
  validateRenderedCustomFields(fields);
  const payload = [...fields]
    .sort((left, right) => left.id - right.id)
    .map((field) => ({
      id: field.id,
      name: field.name,
      dataType: field.dataType,
      ...(field.guidance ? { guidance: field.guidance } : {}),
      ...(field.extraData.selectOptions.length > 0
        ? {
            selectOptions: field.extraData.selectOptions.map((option) => ({
              id: option.id,
              label: option.label,
            })),
          }
        : {}),
      ...(field.extraData.defaultCurrency !== undefined
        ? { defaultCurrency: field.extraData.defaultCurrency }
        : {}),
    }));
  const block = `\n\n${CUSTOM_FIELD_PROMPT_HEADER}\n${JSON.stringify(payload, null, 2)}`;
  if (byteLength(block) > CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES) {
    throw new CustomFieldPolicyError(
      'prompt_too_large',
      `Custom-field prompt block exceeds ${CUSTOM_FIELD_PROMPT_BLOCK_MAX_BYTES} UTF-8 bytes`,
    );
  }
  return block;
}

function normalizedGuidance(value: string | null | undefined, fieldId: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new CustomFieldPolicyError('invalid_guidance', 'Guidance must be text', fieldId);
  }
  const guidance = value.trim();
  if (guidance.length === 0) return null;
  if (guidance.length > MAX_GUIDANCE_LENGTH) {
    throw new CustomFieldPolicyError(
      'invalid_guidance',
      `Guidance must be at most ${MAX_GUIDANCE_LENGTH} characters`,
      fieldId,
    );
  }
  return guidance;
}

function liveDefinitionsById(
  fields: readonly PaperlessCustomField[],
): Map<number, PaperlessCustomField> {
  const definitions = new Map<number, PaperlessCustomField>();
  for (const field of fields) {
    if (definitions.has(field.id)) {
      throw new CustomFieldPolicyError(
        'duplicate_field',
        `Paperless returned duplicate custom field ${field.id}`,
        field.id,
      );
    }
    definitions.set(field.id, field);
  }
  return definitions;
}

export function getCustomFieldPolicy(db: AppDatabase): CustomFieldPolicyEntry[] {
  return db
    .select()
    .from(aiCustomFieldPolicy)
    .orderBy(asc(aiCustomFieldPolicy.fieldId))
    .all()
    .map((row) => ({
      fieldId: row.fieldId,
      fieldName: row.fieldName,
      dataType: row.dataType as CustomFieldPolicyEntry['dataType'],
      guidance: row.guidance,
    }));
}

/**
 * Enforces the durable coupling between custom-field extraction and its
 * allowlist. Call this as the final statement of every transaction that can
 * change either side of the invariant.
 */
export function assertCustomFieldPolicyInvariant(db: AppDatabase): void {
  const enabled =
    db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, 'ai.extractCustomFields'))
      .get()?.value === 'true';
  if (!enabled) return;

  const selected = db
    .select({ fieldId: aiCustomFieldPolicy.fieldId })
    .from(aiCustomFieldPolicy)
    .limit(1)
    .get();
  if (!selected) {
    throw new CustomFieldPolicyError(
      'empty_policy',
      'Select at least one Paperless custom field before enabling extraction',
    );
  }
}

export function replaceCustomFieldPolicy(
  db: AppDatabase,
  requested: readonly CustomFieldPolicySelection[],
  liveFields: readonly PaperlessCustomField[],
): CustomFieldPolicyEntry[] {
  if (requested.length > MAX_CUSTOM_FIELD_POLICY_SIZE) {
    throw new CustomFieldPolicyError(
      'too_many_fields',
      `Select at most ${MAX_CUSTOM_FIELD_POLICY_SIZE} custom fields`,
    );
  }

  const definitions = liveDefinitionsById(liveFields);
  const seen = new Set<number>();
  const entries: CustomFieldPolicyEntry[] = requested.map((selection) => {
    if (!Number.isSafeInteger(selection.fieldId) || selection.fieldId <= 0) {
      throw new CustomFieldPolicyError(
        'invalid_field',
        'Custom field IDs must be positive integers',
      );
    }
    if (seen.has(selection.fieldId)) {
      throw new CustomFieldPolicyError(
        'duplicate_field',
        `Custom field ${selection.fieldId} was selected more than once`,
        selection.fieldId,
      );
    }
    seen.add(selection.fieldId);

    const definition = definitions.get(selection.fieldId);
    if (!definition) {
      throw new CustomFieldPolicyError(
        'unknown_field',
        `Custom field ${selection.fieldId} does not exist in Paperless`,
        selection.fieldId,
      );
    }
    if (definition.dataType === 'documentlink') {
      throw new CustomFieldPolicyError(
        'unsupported_field',
        `Document-link field ${selection.fieldId} cannot be selected`,
        selection.fieldId,
      );
    }

    return {
      fieldId: definition.id,
      fieldName: definition.name,
      dataType: definition.dataType,
      guidance: normalizedGuidance(selection.guidance, definition.id),
    };
  });

  entries.sort((left, right) => left.fieldId - right.fieldId);
  renderCustomFieldPromptBlock(
    entries.map((entry) => ({
      ...definitions.get(entry.fieldId)!,
      guidance: entry.guidance,
    })),
  );
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(aiCustomFieldPolicy).run();
    if (entries.length > 0) {
      tx.insert(aiCustomFieldPolicy)
        .values(entries.map((entry) => ({ ...entry, updatedAt: now })))
        .run();
    }
    assertCustomFieldPolicyInvariant(tx as unknown as AppDatabase);
  });
  return entries;
}

export function resolveCustomFieldPolicy(
  db: AppDatabase,
  liveFields: readonly PaperlessCustomField[],
): ResolvedCustomField[] {
  const policy = getCustomFieldPolicy(db);
  if (policy.length === 0) {
    throw new CustomFieldPolicyError(
      'empty_policy',
      'Custom-field extraction is enabled but no custom fields are selected',
    );
  }

  const definitions = liveDefinitionsById(liveFields);
  const resolved = policy.map((entry) => {
    const live = definitions.get(entry.fieldId);
    if (!live) {
      throw new CustomFieldPolicyError(
        'missing_field',
        `Selected custom field ${entry.fieldId} no longer exists`,
        entry.fieldId,
      );
    }
    if (live.name !== entry.fieldName) {
      throw new CustomFieldPolicyError(
        'renamed_field',
        `Selected custom field ${entry.fieldId} was renamed`,
        entry.fieldId,
      );
    }
    if (live.dataType !== entry.dataType) {
      throw new CustomFieldPolicyError(
        'type_changed_field',
        `Selected custom field ${entry.fieldId} changed type`,
        entry.fieldId,
      );
    }
    return { ...live, guidance: entry.guidance };
  });
  renderCustomFieldPromptBlock(resolved);
  return resolved;
}
