import { describe, it, expect } from 'vitest';
import { buildPromptParts, truncateContent } from '../prompt.js';

describe('buildPromptParts', () => {
  const baseOptions = {
    promptTemplate:
      'Correspondents: {{existing_correspondents}}\nTypes: {{existing_document_types}}\nTags: {{existing_tags}}',
    documentTitle: 'Invoice #123',
    documentContent: 'Amazon order total £42.99',
    existingCorrespondents: ['Amazon', 'Barclays'],
    existingDocumentTypes: ['Invoice', 'Receipt'],
    existingTags: ['finance', 'shopping'],
    includeCorrespondents: true,
    includeDocumentTypes: true,
    includeTags: true,
    tagAliasesEnabled: false,
    tagAliasMap: '',
  };

  it('substitutes reference data into the template', () => {
    const { systemPrompt } = buildPromptParts(baseOptions);
    expect(systemPrompt).toContain('Amazon, Barclays');
    expect(systemPrompt).toContain('Invoice, Receipt');
    expect(systemPrompt).toContain('finance, shopping');
  });

  it('uses "(none provided)" when include flag is false', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      includeCorrespondents: false,
      includeDocumentTypes: false,
      includeTags: false,
    });
    expect(systemPrompt).toContain('Correspondents: (none provided)');
    expect(systemPrompt).toContain('Types: (none provided)');
    expect(systemPrompt).toContain('Tags: (none provided)');
  });

  it('uses "(none provided)" when list is empty but include is true', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      existingCorrespondents: [],
      existingDocumentTypes: [],
      existingTags: [],
      includeCorrespondents: true,
      includeDocumentTypes: true,
      includeTags: true,
    });
    expect(systemPrompt).toContain('Correspondents: (none provided)');
    expect(systemPrompt).toContain('Types: (none provided)');
    expect(systemPrompt).toContain('Tags: (none provided)');
  });

  it('formats user prompt as plain text', () => {
    const { userPrompt } = buildPromptParts(baseOptions);
    expect(userPrompt).toBe(
      'Document Title\nInvoice #123\n\nDocument Text\nAmazon order total £42.99',
    );
    expect(userPrompt).not.toContain('<document>');
  });

  it('injects tag alias map when enabled', () => {
    const aliasYaml = 'nhs:\n  - national-health-service';
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: 'Tags: {{existing_tags}}\n\n{{tag_aliases}}',
      tagAliasesEnabled: true,
      tagAliasMap: aliasYaml,
    });
    expect(systemPrompt).toContain('<alias_map>');
    expect(systemPrompt).toContain('nhs:');
    expect(systemPrompt).toContain('national-health-service');
    expect(systemPrompt).toContain('</alias_map>');
  });

  it('injects disabled message when tag aliases are off', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: '{{tag_aliases}}',
      tagAliasesEnabled: false,
      tagAliasMap: 'nhs:\n  - national-health-service',
    });
    expect(systemPrompt).toContain('No tag alias mappings are configured.');
    expect(systemPrompt).not.toContain('<alias_map>');
  });

  it('leaves prompt unchanged when no {{tag_aliases}} placeholder exists', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: 'No placeholder here',
      tagAliasesEnabled: true,
      tagAliasMap: 'nhs:\n  - national-health-service',
    });
    expect(systemPrompt).toBe('No placeholder here');
  });

  it('sorts reference lists alphabetically for deterministic prompts', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      existingCorrespondents: ['Zebra Corp', 'Amazon', 'barclays'],
      existingDocumentTypes: ['Receipt', 'Invoice', 'contract'],
      existingTags: ['shopping', 'Finance', 'auto'],
    });
    expect(systemPrompt).toContain('Amazon, barclays, Zebra Corp');
    expect(systemPrompt).toContain('contract, Invoice, Receipt');
    expect(systemPrompt).toContain('auto, Finance, shopping');
  });
});

describe('truncateContent', () => {
  it('returns content unchanged when under maxLength', () => {
    const content = 'Short content here.';
    expect(truncateContent(content, 1000)).toBe(content);
  });

  it('returns content unchanged when exactly at maxLength', () => {
    const content = 'x'.repeat(500);
    expect(truncateContent(content, 500)).toBe(content);
  });

  it('inserts truncation marker for content exceeding maxLength', () => {
    const content = 'x'.repeat(2000);
    const result = truncateContent(content, 500);
    expect(result).toContain('[... middle content truncated ...]');
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('preserves header and footer portions', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: some text here`);
    const content = lines.join('\n');
    const result = truncateContent(content, 500);
    // Header should contain early lines
    expect(result).toContain('Line 1:');
    // Footer should contain late lines
    expect(result).toContain(`Line ${lines.length}:`);
    expect(result).toContain('[... middle content truncated ...]');
  });

  it('trims to line boundaries when possible', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${String(i + 1).padStart(3, '0')}`);
    const content = lines.join('\n');
    const result = truncateContent(content, 200);
    // The header portion should end at a complete line, not mid-word
    const [header] = result.split('[... middle content truncated ...]');
    // Header should end without a partial line (last char should be newline-trimmed content)
    const headerLines = header.trimEnd().split('\n');
    for (const line of headerLines) {
      expect(line).toMatch(/^Line \d{3}$/);
    }
  });

  it('allocates roughly 60% to header and 40% to footer', () => {
    const content = 'a'.repeat(100) + '\n' + 'b'.repeat(100) + '\n' + 'c'.repeat(100);
    const result = truncateContent(content, 150);
    const marker = '[... middle content truncated ...]';
    const markerIdx = result.indexOf(marker);
    expect(markerIdx).toBeGreaterThan(0);
    const headerLen = markerIdx;
    const footerLen = result.length - markerIdx - marker.length;
    // Header should be larger than footer (60/40 split)
    expect(headerLen).toBeGreaterThanOrEqual(footerLen);
  });
});
