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

const REFERENCE_DATA_RULES = `## Reference Data Rules
- STRONGLY prefer matching existing entries from the provided lists below
- Only suggest NEW correspondents/types when there is clearly no match in existing lists
- For tags: prefer existing tags, but may suggest up to 2 new tags if they add meaningful value
- Provide a short evidence snippet in the "evidence" field citing the document text that supports your classifications`;

const NO_REFERENCE_DATA_RULES = `## Classification Rules
- No reference lists are provided — all suggested names are considered new
- Provide a short evidence snippet in the "evidence" field citing the document text that supports your classifications`;

const FEW_SHOT_EXAMPLES = `## Examples

### Example 1: Matching an existing correspondent
Document text: "Amazon.co.uk\\n1 Principal Place, Worship Street\\nLondon EC2A 2FA\\n\\nInvoice #INV-2024-0391\\nDate: 10 Jan 2024\\nTotal: £42.99"
Existing correspondents: Amazon, Barclays, HMRC

Response:
\`\`\`json
{
  "correspondent": "Amazon",
  "documentType": "Invoice",
  "tags": ["electronics"],
  "confidence": { "correspondent": 0.95, "documentType": 0.95, "tags": 0.7 },
  "evidence": "Amazon.co.uk header, Invoice #INV-2024-0391"
}
\`\`\`

### Example 2: Weak evidence — return null
Document text: "Page 3 of 7\\n\\n...continued from previous page.\\nThe results are shown in Table 2.\\nSee appendix for details."

Response:
\`\`\`json
{
  "correspondent": null,
  "documentType": null,
  "tags": [],
  "confidence": { "correspondent": 0.05, "documentType": 0.1, "tags": 0.05 },
  "evidence": "Fragment of a larger document with no identifying information"
}
\`\`\`

### Example 3: Restrained tag usage
Document text: "British Gas\\nEnergy Bill\\nAccount: 850012345\\nPeriod: 1 Jan - 31 Mar 2024\\nElectricity: £127.50\\nGas: £89.30\\nTotal: £216.80"
Existing tags: utilities, energy, quarterly, tax-2024

Response:
\`\`\`json
{
  "correspondent": "British Gas",
  "documentType": "Utility Bill",
  "tags": ["utilities", "energy", "quarterly"],
  "confidence": { "correspondent": 0.95, "documentType": 0.9, "tags": 0.85 },
  "evidence": "British Gas header, Energy Bill, period 1 Jan - 31 Mar 2024"
}
\`\`\``;

const FEW_SHOT_EXAMPLES_XML = `<examples>
<example>
<description>Matching an existing correspondent</description>
<document_text>Amazon.co.uk
1 Principal Place, Worship Street
London EC2A 2FA

Invoice #INV-2024-0391
Date: 10 Jan 2024
Total: £42.99</document_text>
<existing_correspondents>Amazon, Barclays, HMRC</existing_correspondents>
<response>
{
  "correspondent": "Amazon",
  "documentType": "Invoice",
  "tags": ["electronics"],
  "confidence": { "correspondent": 0.95, "documentType": 0.95, "tags": 0.7 },
  "evidence": "Amazon.co.uk header, Invoice #INV-2024-0391"
}
</response>
</example>

<example>
<description>Weak evidence — return null</description>
<document_text>Page 3 of 7

...continued from previous page.
The results are shown in Table 2.
See appendix for details.</document_text>
<response>
{
  "correspondent": null,
  "documentType": null,
  "tags": [],
  "confidence": { "correspondent": 0.05, "documentType": 0.1, "tags": 0.05 },
  "evidence": "Fragment of a larger document with no identifying information"
}
</response>
</example>

<example>
<description>Restrained tag usage</description>
<document_text>British Gas
Energy Bill
Account: 850012345
Period: 1 Jan - 31 Mar 2024
Electricity: £127.50
Gas: £89.30
Total: £216.80</document_text>
<existing_tags>utilities, energy, quarterly, tax-2024</existing_tags>
<response>
{
  "correspondent": "British Gas",
  "documentType": "Utility Bill",
  "tags": ["utilities", "energy", "quarterly"],
  "confidence": { "correspondent": 0.95, "documentType": 0.9, "tags": 0.85 },
  "evidence": "British Gas header, Energy Bill, period 1 Jan - 31 Mar 2024"
}
</response>
</example>
</examples>`;

/**
 * Detects whether a prompt template uses old-style placeholders
 * ({{correspondents}}, {{documentTypes}}, {{tags}}) instead of {{referenceData}}.
 */
function isLegacyTemplate(template: string): boolean {
  return (
    template.includes('{{correspondents}}') ||
    template.includes('{{documentTypes}}') ||
    template.includes('{{tags}}')
  );
}

/**
 * Builds split system/user prompts from the template and options.
 * Supports both the new {{referenceData}} placeholder and legacy
 * {{correspondents}}/{{documentTypes}}/{{tags}} placeholders for
 * backward compatibility with user-customized templates.
 *
 * When provider is 'anthropic', wraps sections in XML tags.
 * When provider is 'openai' or undefined, uses markdown sections.
 */
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

  if (isLegacyTemplate(promptTemplate)) {
    return buildLegacyPromptParts(options);
  }

  const isAnthropic = provider === 'anthropic';

  // Build reference data block from enabled/non-empty lists
  const sections: string[] = [];

  if (includeCorrespondents && existingCorrespondents.length > 0) {
    if (isAnthropic) {
      sections.push(
        `<existing_correspondents>\n${existingCorrespondents.join(', ')}\n</existing_correspondents>`,
      );
    } else {
      sections.push(`## Existing Correspondents\n${existingCorrespondents.join(', ')}`);
    }
  }
  if (includeDocumentTypes && existingDocumentTypes.length > 0) {
    if (isAnthropic) {
      sections.push(
        `<existing_document_types>\n${existingDocumentTypes.join(', ')}\n</existing_document_types>`,
      );
    } else {
      sections.push(`## Existing Document Types\n${existingDocumentTypes.join(', ')}`);
    }
  }
  if (includeTags && existingTags.length > 0) {
    if (isAnthropic) {
      sections.push(`<existing_tags>\n${existingTags.join(', ')}\n</existing_tags>`);
    } else {
      sections.push(`## Existing Tags\n${existingTags.join(', ')}`);
    }
  }

  const hasReferenceData = sections.length > 0;
  let referenceBlock: string;
  if (isAnthropic) {
    const rules = hasReferenceData ? REFERENCE_DATA_RULES : NO_REFERENCE_DATA_RULES;
    referenceBlock = hasReferenceData
      ? `<reference_data>\n${rules}\n\n${sections.join('\n\n')}\n</reference_data>`
      : `<reference_data>\n${rules}\n</reference_data>`;
  } else {
    referenceBlock = hasReferenceData
      ? `${REFERENCE_DATA_RULES}\n\n${sections.join('\n\n')}`
      : NO_REFERENCE_DATA_RULES;
  }

  // Build examples block
  const examplesBlock = isAnthropic ? FEW_SHOT_EXAMPLES_XML : FEW_SHOT_EXAMPLES;

  // System prompt: everything except the per-document content
  let systemPrompt = promptTemplate
    .replace('{{referenceData}}', referenceBlock)
    .replace('{{examples}}', promptTemplate.includes('{{examples}}') ? examplesBlock : '')
    .replace('{{title}}', '')
    .replace('{{content}}', '')
    .replace(/## Document Title\s*\n\s*\n/, '')
    .replace(/## Document Text\s*\n\s*$/, '')
    .trim();

  // If template lacks {{examples}} placeholder, append examples after main content
  if (!promptTemplate.includes('{{examples}}')) {
    systemPrompt = `${systemPrompt}\n\n${examplesBlock}`;
  }

  // Wrap system prompt in XML instructions tag for Anthropic
  if (isAnthropic) {
    // Extract the instruction portion (before reference_data/examples) and wrap it
    // Since the template already has sections replaced, we wrap the whole thing
    systemPrompt = `<instructions>\n${systemPrompt}\n</instructions>`;
  }

  // User prompt: per-document content
  const userPrompt = isAnthropic
    ? `<document>\n<title>${documentTitle}</title>\n<content>\n${documentContent}\n</content>\n</document>`
    : `## Document Title\n${documentTitle}\n\n## Document Text\n${documentContent}`;

  return { systemPrompt, userPrompt };
}

/**
 * Handles legacy templates with {{correspondents}}/{{documentTypes}}/{{tags}} placeholders.
 * Produces a single concatenated system prompt for backward compatibility.
 */
function buildLegacyPromptParts(options: BuildPromptOptions): PromptParts {
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

  const isAnthropic = provider === 'anthropic';

  const correspondentList =
    includeCorrespondents && existingCorrespondents.length > 0
      ? existingCorrespondents.join(', ')
      : '(none provided)';
  const documentTypeList =
    includeDocumentTypes && existingDocumentTypes.length > 0
      ? existingDocumentTypes.join(', ')
      : '(none provided)';
  const tagList =
    includeTags && existingTags.length > 0 ? existingTags.join(', ') : '(none provided)';

  const systemPrompt = promptTemplate
    .replace('{{correspondents}}', correspondentList)
    .replace('{{documentTypes}}', documentTypeList)
    .replace('{{tags}}', tagList)
    .replace('{{title}}', '')
    .replace('{{content}}', '')
    .replace(/## Document Title\s*\n\s*\n/, '')
    .replace(/## Document Text\s*\n\s*$/, '')
    .trim();

  const userPrompt = isAnthropic
    ? `<document>\n<title>${documentTitle}</title>\n<content>\n${documentContent}\n</content>\n</document>`
    : `## Document Title\n${documentTitle}\n\n## Document Text\n${documentContent}`;

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
