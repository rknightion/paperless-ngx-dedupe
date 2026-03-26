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
  provider?: 'openai' | 'anthropic';
}

/**
 * Builds split system/user prompts from the template and options.
 *
 * Replaces {{existing_correspondents}}, {{existing_document_types}}, and
 * {{existing_tags}} in the template with the provided reference data.
 *
 * When provider is 'anthropic', wraps system prompt in XML tags.
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
    provider,
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

  let systemPrompt = promptTemplate
    .replace('{{existing_correspondents}}', correspondentList)
    .replace('{{existing_document_types}}', documentTypeList)
    .replace('{{existing_tags}}', tagList)
    .trim();

  const isAnthropic = provider === 'anthropic';

  if (isAnthropic) {
    systemPrompt = `<instructions>\n${systemPrompt}\n</instructions>`;
  }

  const userPrompt = isAnthropic
    ? `<document>\n<title>${documentTitle}</title>\n<content>\n${documentContent}\n</content>\n</document>`
    : `Document Title\n${documentTitle}\n\nDocument Text\n${documentContent}`;

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
