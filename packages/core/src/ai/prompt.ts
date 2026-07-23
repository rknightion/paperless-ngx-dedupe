export interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export interface BuildPromptOptions {
  promptTemplate: string;
  documentTitle: string;
  documentContent: string;
  existingCorrespondents: string[];
  existingDocumentTypes: string[];
  existingTags: string[];
  includeCorrespondents: boolean;
  includeDocumentTypes: boolean;
  includeTags: boolean;
  tagAliasesEnabled: boolean;
  tagAliasMap: string;
  customFields?: PaperlessCustomField[];
  extractCustomFields?: boolean;
}

/**
 * Builds split system/user prompts from the template and options.
 *
 * Replaces {{existing_correspondents}}, {{existing_document_types}},
 * {{existing_tags}}, and {{tag_aliases}} in the template with the
 * provided reference data.
 */
/** Case-insensitive sort without mutating the original array. */
function sortedInsensitive(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function buildPromptParts(options: BuildPromptOptions): PromptParts {
  const {
    promptTemplate,
    documentTitle,
    documentContent,
    existingCorrespondents,
    existingDocumentTypes,
    existingTags,
    includeCorrespondents,
    includeDocumentTypes,
    includeTags,
    tagAliasesEnabled,
    tagAliasMap,
    customFields = [],
    extractCustomFields = false,
  } = options;

  const correspondentList =
    includeCorrespondents && existingCorrespondents.length > 0
      ? sortedInsensitive(existingCorrespondents).join(', ')
      : '(none provided)';

  const documentTypeList =
    includeDocumentTypes && existingDocumentTypes.length > 0
      ? sortedInsensitive(existingDocumentTypes).join(', ')
      : '(none provided)';

  const tagList =
    includeTags && existingTags.length > 0
      ? sortedInsensitive(existingTags).join(', ')
      : '(none provided)';

  const tagAliasBlock = tagAliasesEnabled
    ? `Tag Alias Map:\n<alias_map>\n${tagAliasMap}\n</alias_map>`
    : 'No tag alias mappings are configured.';

  const baseSystemPrompt = promptTemplate
    .replace('{{existing_correspondents}}', correspondentList)
    .replace('{{existing_document_types}}', documentTypeList)
    .replace('{{existing_tags}}', tagList)
    .replace('{{tag_aliases}}', tagAliasBlock)
    .trim();

  const customFieldPrompt =
    extractCustomFields && customFields.length > 0
      ? `\n\nPaperless Custom Fields
Only recommend fields from this list. Omit a field when its value is not explicitly supported by the document text.
Return the field ID exactly as provided. For select fields, return the option ID, not its label or position.
Do not recommend documentlink fields. String values must be at most 128 characters; dates must use YYYY-MM-DD.
${JSON.stringify(
  customFields.map((field) => ({
    id: field.id,
    name: field.name,
    dataType: field.dataType,
    ...(field.extraData.selectOptions.length > 0
      ? { selectOptions: field.extraData.selectOptions }
      : {}),
    ...(field.extraData.defaultCurrency !== undefined
      ? { defaultCurrency: field.extraData.defaultCurrency }
      : {}),
  })),
  null,
  2,
)}`
      : '';

  const systemPrompt = `${baseSystemPrompt}${customFieldPrompt}`;

  const userPrompt = `Document Title\n${documentTitle}\n\nDocument Text\n${documentContent}`;

  return { systemPrompt, userPrompt };
}

/**
 * Structure-aware truncation that preserves document header/footer and trims from the middle.
 * Trims to line boundaries to avoid splitting tables mid-row.
 */
export function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;

  const marker = '\n\n[... middle content truncated ...]\n\n';
  const available = maxLength - marker.length;
  if (available <= 0) return content.slice(0, maxLength);

  const headerBudget = Math.floor(available * 0.6);
  const footerBudget = available - headerBudget;

  // Trim header to last complete line break
  const headerSlice = content.slice(0, headerBudget);
  const lastNewline = headerSlice.lastIndexOf('\n');
  const header = lastNewline > headerBudget * 0.8 ? headerSlice.slice(0, lastNewline) : headerSlice;

  // Trim footer to first complete line break
  const footerSlice = content.slice(-footerBudget);
  const firstNewline = footerSlice.indexOf('\n');
  const footer =
    firstNewline > 0 && firstNewline < footerBudget * 0.2
      ? footerSlice.slice(firstNewline + 1)
      : footerSlice;

  return header + marker + footer;
}
import type { PaperlessCustomField } from '../paperless/types.js';
