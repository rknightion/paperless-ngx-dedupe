import { describe, expect, it } from 'vitest';
import { evaluateGates } from '../gates.js';
import { DEFAULT_AI_CONFIG } from '../types.js';

describe('evaluateGates', () => {
  it('reports confidence review information without unattended apply eligibility', () => {
    const evaluation = evaluateGates(DEFAULT_AI_CONFIG, {
      confidence: { title: 0.95, correspondent: 0.95, documentType: 0.95, tags: 0.95 },
      suggestedTitle: 'Invoice',
      suggestedCorrespondent: 'Example Ltd',
      suggestedDocumentType: 'Invoice',
      suggestedTags: ['finance'],
    });

    expect(evaluation).toEqual({
      passes: true,
      fieldsPassing: ['title', 'correspondent', 'documentType', 'tags'],
      fieldsFailing: [],
      reasons: [],
    });
  });
});
