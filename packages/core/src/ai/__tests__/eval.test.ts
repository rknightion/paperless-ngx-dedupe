import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { EVAL_FIXTURES, type EvalFixture } from './eval-fixtures.js';
import { DEFAULT_EXTRACTION_PROMPT } from '../types.js';
import { processDocument } from '../extract.js';
import { createAiProvider } from '../providers/factory.js';

// --- Pure metric functions (testable without API keys) ---

export function exactMatch(predicted: string | null, expected: string | null): boolean {
  if (predicted === null && expected === null) return true;
  if (predicted === null || expected === null) return false;
  return predicted.toLowerCase().trim() === expected.toLowerCase().trim();
}

export function tagF1(
  predicted: string[],
  expected: string[],
): { precision: number; recall: number; f1: number } {
  if (expected.length === 0 && predicted.length === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (predicted.length === 0) return { precision: 0, recall: 0, f1: 0 };
  if (expected.length === 0) return { precision: 0, recall: 0, f1: 0 };

  const predSet = new Set(predicted.map((t) => t.toLowerCase().trim()));
  const expSet = new Set(expected.map((t) => t.toLowerCase().trim()));

  let truePositives = 0;
  for (const tag of predSet) {
    if (expSet.has(tag)) truePositives++;
  }

  const precision = truePositives / predSet.size;
  const recall = truePositives / expSet.size;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}

export function isValidSchema(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const r = response as Record<string, unknown>;

  // Check required fields
  if (!('title' in r)) return false;
  if (!('correspondent' in r)) return false;
  if (!('documentType' in r)) return false;
  if (!('tags' in r) || !Array.isArray(r.tags)) return false;
  if (!('confidence' in r) || typeof r.confidence !== 'object' || r.confidence === null)
    return false;
  if (!('evidence' in r) || typeof r.evidence !== 'string') return false;

  // Check confidence sub-fields
  const conf = r.confidence as Record<string, unknown>;
  if (typeof conf.title !== 'number') return false;
  if (typeof conf.correspondent !== 'number') return false;
  if (typeof conf.documentType !== 'number') return false;
  if (typeof conf.tags !== 'number') return false;

  // Check confidence bounds
  for (const key of ['title', 'correspondent', 'documentType', 'tags'] as const) {
    const val = conf[key] as number;
    if (val < 0 || val > 1) return false;
  }

  // Check types
  if (r.title !== null && typeof r.title !== 'string') return false;
  if (r.correspondent !== null && typeof r.correspondent !== 'string') return false;
  if (r.documentType !== null && typeof r.documentType !== 'string') return false;
  if (!r.tags.every((t: unknown) => typeof t === 'string')) return false;

  return true;
}

function promptHash(): string {
  return createHash('sha256').update(DEFAULT_EXTRACTION_PROMPT).digest('hex').slice(0, 12);
}

// --- Unit tests for metric functions (always run) ---

describe('eval metric functions', () => {
  describe('exactMatch', () => {
    it('matches identical strings case-insensitively', () => {
      expect(exactMatch('Amazon', 'amazon')).toBe(true);
      expect(exactMatch('HMRC', 'hmrc')).toBe(true);
    });

    it('matches nulls', () => {
      expect(exactMatch(null, null)).toBe(true);
    });

    it('rejects mismatches', () => {
      expect(exactMatch('Amazon', 'Barclays')).toBe(false);
      expect(exactMatch('Amazon', null)).toBe(false);
      expect(exactMatch(null, 'Amazon')).toBe(false);
    });
  });

  describe('tagF1', () => {
    it('returns 1.0 for perfect match', () => {
      const result = tagF1(['tax-2024', 'finance'], ['tax-2024', 'finance']);
      expect(result.f1).toBe(1);
    });

    it('returns 1.0 for both empty', () => {
      const result = tagF1([], []);
      expect(result.f1).toBe(1);
    });

    it('handles partial overlap', () => {
      const result = tagF1(['tax-2024', 'finance', 'extra'], ['tax-2024', 'finance']);
      expect(result.recall).toBe(1);
      expect(result.precision).toBeCloseTo(2 / 3);
      expect(result.f1).toBeGreaterThan(0.7);
    });

    it('returns 0 for no overlap', () => {
      const result = tagF1(['a', 'b'], ['c', 'd']);
      expect(result.f1).toBe(0);
    });
  });

  describe('isValidSchema', () => {
    it('accepts valid response', () => {
      expect(
        isValidSchema({
          title: 'Amazon Invoice INV-2024-0847',
          correspondent: 'Amazon',
          documentType: 'Invoice',
          tags: ['electronics'],
          confidence: { title: 0.9, correspondent: 0.9, documentType: 0.95, tags: 0.8 },
          evidence: 'Amazon.co.uk, Invoice #INV-2024-0847',
        }),
      ).toBe(true);
    });

    it('accepts null title/correspondent/documentType', () => {
      expect(
        isValidSchema({
          title: null,
          correspondent: null,
          documentType: null,
          tags: [],
          confidence: { title: 0.1, correspondent: 0.1, documentType: 0.1, tags: 0.1 },
          evidence: 'No clear information',
        }),
      ).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(isValidSchema({ correspondent: 'Amazon' })).toBe(false);
      expect(isValidSchema(null)).toBe(false);
      expect(isValidSchema({})).toBe(false);
    });

    it('rejects out-of-bounds confidence', () => {
      expect(
        isValidSchema({
          title: 'Test',
          correspondent: 'Amazon',
          documentType: 'Invoice',
          tags: [],
          confidence: { title: 0.5, correspondent: 1.5, documentType: 0.5, tags: 0.5 },
          evidence: 'test',
        }),
      ).toBe(false);
    });
  });
});

// --- Integration eval suite (requires API key + AI_EVAL=true) ---

describe.skipIf(!process.env.AI_EVAL)('AI eval suite', () => {
  const apiKey = process.env.AI_OPENAI_API_KEY;
  const model = process.env.AI_EVAL_MODEL ?? 'gpt-5.4-mini';

  it('should have a valid API key', () => {
    expect(apiKey).toBeTruthy();
  });

  it('should have a prompt hash for snapshot tracking', () => {
    const hash = promptHash();
    expect(hash).toHaveLength(12);
    console.log(`Prompt hash: ${hash}`);
  });

  async function runFixture(fixture: EvalFixture) {
    const aiProvider = await createAiProvider(apiKey!, model);

    const result = await processDocument({
      provider: aiProvider,
      documentTitle: fixture.document.title,
      documentContent: fixture.document.content,
      existingCorrespondents: fixture.referenceData.correspondents,
      existingDocumentTypes: fixture.referenceData.documentTypes,
      existingTags: fixture.referenceData.tags,
      promptTemplate: DEFAULT_EXTRACTION_PROMPT,
      maxContentLength: 8000,
      includeCorrespondents: true,
      includeDocumentTypes: true,
      includeTags: true,
    });

    return result.response;
  }

  for (const fixture of EVAL_FIXTURES) {
    it(`should produce valid schema for: ${fixture.name}`, async () => {
      const response = await runFixture(fixture);
      expect(isValidSchema(response)).toBe(true);
    }, 30_000);
  }

  it('should meet aggregate quality thresholds', async function () {
    const results = [];
    for (const fixture of EVAL_FIXTURES) {
      const response = await runFixture(fixture);
      results.push({ fixture, response });
    }

    let schemaValid = 0;
    let correspondentCorrect = 0;
    let documentTypeCorrect = 0;
    const tagF1Scores: number[] = [];

    for (const { fixture, response } of results) {
      if (isValidSchema(response)) schemaValid++;
      if (exactMatch(response.correspondent, fixture.expected.correspondent))
        correspondentCorrect++;
      if (exactMatch(response.documentType, fixture.expected.documentType)) documentTypeCorrect++;
      tagF1Scores.push(tagF1(response.tags, fixture.expected.tags).f1);
    }

    const total = results.length;
    const avgTagF1 = tagF1Scores.reduce((a, b) => a + b, 0) / tagF1Scores.length;

    console.log(
      `\nEval Results (prompt hash: ${promptHash()}, provider: openai, model: ${model}):`,
    );
    console.log(
      `  Schema valid: ${schemaValid}/${total} (${((schemaValid / total) * 100).toFixed(0)}%)`,
    );
    console.log(
      `  Correspondent exact match: ${correspondentCorrect}/${total} (${((correspondentCorrect / total) * 100).toFixed(0)}%)`,
    );
    console.log(
      `  Document type exact match: ${documentTypeCorrect}/${total} (${((documentTypeCorrect / total) * 100).toFixed(0)}%)`,
    );
    console.log(`  Average tag F1: ${avgTagF1.toFixed(2)}`);

    expect(schemaValid / total).toBe(1);
    expect(correspondentCorrect / total).toBeGreaterThanOrEqual(0.7);
    expect(avgTagF1).toBeGreaterThanOrEqual(0.6);
  }, 120_000);
});
