import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { reviewedMutationPlan } from '../../schema/sqlite/review.js';
import type { PaperlessClient } from '../../paperless/client.js';
import { PaperlessApiError } from '../../paperless/errors.js';
import { getAiResult } from '../queries.js';

vi.mock('../../telemetry/spans.js', () => ({
  withSpan: vi
    .fn()
    .mockImplementation((_name, _attrs, fn) =>
      fn({ setAttribute: vi.fn(), setAttributes: vi.fn() }),
    ),
}));

vi.mock('../../telemetry/metrics.js', () => ({
  aiApplyTotal: vi.fn(() => ({ add: vi.fn() })),
}));

// Import after mocks are registered
const { applyAiResult, rejectAiResult, batchRejectAiResults } = await import('../apply.js');
const { revertAiResult } = await import('../revert.js');
const { claimAiMutationPlan, createAiApplyPlan, executeClaimedAiApplyPlan } =
  await import('../preflight.js');
const { createAiRevertPlan, executeClaimedAiRevertPlan } = await import('../revert.js');

function createMockClient() {
  return {
    getCorrespondents: vi.fn().mockResolvedValue([
      { id: 1, name: 'Amazon', slug: 'amazon', matchingAlgorithm: 0 },
      { id: 2, name: 'Barclays', slug: 'barclays', matchingAlgorithm: 0 },
    ]),
    getDocumentTypes: vi.fn().mockResolvedValue([
      { id: 1, name: 'Invoice', slug: 'invoice', matchingAlgorithm: 0 },
      { id: 2, name: 'Receipt', slug: 'receipt', matchingAlgorithm: 0 },
    ]),
    getTags: vi.fn().mockResolvedValue([
      { id: 1, name: 'finance', slug: 'finance', color: '#000' },
      { id: 2, name: 'shopping', slug: 'shopping', color: '#000' },
    ]),
    getCustomFields: vi.fn().mockResolvedValue([
      {
        id: 7,
        name: 'Payment Status',
        dataType: 'select',
        extraData: {
          selectOptions: [
            { id: 'open-id', label: 'Open' },
            { id: 'paid-id', label: 'Paid' },
          ],
        },
        documentCount: 0,
      },
      {
        id: 8,
        name: 'Due Date',
        dataType: 'date',
        extraData: { selectOptions: [] },
        documentCount: 0,
      },
      {
        id: 99,
        name: 'Existing Field',
        dataType: 'string',
        extraData: { selectOptions: [] },
        documentCount: 0,
      },
    ]),
    createCorrespondent: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), matchingAlgorithm: 0 }),
      ),
    createDocumentType: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), matchingAlgorithm: 0 }),
      ),
    createTag: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ id: 99, name, slug: name.toLowerCase(), color: '#000' }),
      ),
    updateDocument: vi.fn().mockResolvedValue(undefined),
    getDocument: vi.fn().mockResolvedValue({
      id: 1,
      title: 'Invoice A',
      content: '',
      tags: [],
      correspondent: null,
      documentType: null,
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      added: '2024-01-01T00:00:00Z',
      originalFileName: null,
      archivedFileName: null,
      archiveSerialNumber: null,
      customFields: [
        { field: 7, value: 'open-id' },
        { field: 99, value: 'preserve me' },
      ],
    }),
  } as unknown as PaperlessClient;
}

function seedDocumentAndResult(db: AppDatabase): string {
  db.insert(document)
    .values({
      id: 'doc-1',
      paperlessId: 1,
      title: 'Invoice A',
      processingStatus: 'completed',
      syncedAt: '2024-01-01T00:00:00Z',
    })
    .run();

  const result = db
    .insert(aiProcessingResult)
    .values({
      documentId: 'doc-1',
      paperlessId: 1,
      provider: 'openai',
      model: 'gpt-5.4-mini',
      suggestedCorrespondent: 'Amazon',
      suggestedDocumentType: 'Invoice',
      suggestedTagsJson: '["finance","new-tag"]',
      confidenceJson: '{"correspondent":0.9,"documentType":0.95,"tags":0.8}',
      appliedStatus: 'pending_review',
      promptTokens: 100,
      completionTokens: 50,
      createdAt: '2024-01-01T00:00:00Z',
    })
    .returning()
    .get();

  return result.id;
}

describe('applyAiResult', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultId = seedDocumentAndResult(db);
  });

  it('resolves existing correspondent by name (case-insensitive) and applies', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ correspondent: 1 }), // Amazon has id 1
    );
    expect(client.createCorrespondent).not.toHaveBeenCalled();
  });

  it('creates new correspondent when not found in list', async () => {
    const client = createMockClient();
    // Change suggested correspondent to something not in the list
    db.update(aiProcessingResult).set({ suggestedCorrespondent: 'HMRC' }).run();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.createCorrespondent).toHaveBeenCalledWith('HMRC');
    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ correspondent: 99 }),
    );
  });

  it('resolves existing document type', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['documentType'],
    });

    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ documentType: 1 }), // Invoice has id 1
    );
    expect(client.createDocumentType).not.toHaveBeenCalled();
  });

  it('resolves existing tags and creates missing ones', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
    });

    // 'finance' exists (id 1), 'new-tag' does not
    expect(client.createTag).toHaveBeenCalledWith('new-tag');
    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        tags: expect.arrayContaining([1, 99]),
      }),
    );
  });

  it('applies only selected fields', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent');
    expect(updateArg).not.toHaveProperty('documentType');
    expect(updateArg).not.toHaveProperty('tags');
  });

  it('calls client.updateDocument with resolved numeric IDs', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'documentType', 'tags'],
    });

    expect(client.updateDocument).toHaveBeenCalledTimes(1);
    const [paperlessId, update] = vi.mocked(client.updateDocument).mock.calls[0];
    expect(paperlessId).toBe(1);
    expect(typeof update.correspondent).toBe('number');
    expect(typeof update.documentType).toBe('number');
    expect(Array.isArray(update.tags)).toBe(true);
  });

  it('throws for missing result ID', async () => {
    const client = createMockClient();
    await expect(
      applyAiResult(db, client, 'nonexistent-id', { fields: ['correspondent'] }),
    ).rejects.toThrow('AI result not found');
  });

  it('throws when result has no suggestions', async () => {
    const client = createMockClient();
    // Insert a result with null suggestions
    db.insert(document)
      .values({
        id: 'doc-empty',
        paperlessId: 99,
        title: 'Empty',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const emptyResult = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-empty',
        paperlessId: 99,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        suggestedTagsJson: null,
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    await expect(
      applyAiResult(db, client, emptyResult.id, { fields: ['correspondent'] }),
    ).rejects.toThrow('No suggestions to apply');
  });

  it('marks DB as failed with no_suggestions failure type when no suggestions', async () => {
    const client = createMockClient();
    db.insert(document)
      .values({
        id: 'doc-empty2',
        paperlessId: 100,
        title: 'Empty 2',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const emptyResult = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-empty2',
        paperlessId: 100,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        suggestedTagsJson: null,
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    await expect(
      applyAiResult(db, client, emptyResult.id, { fields: ['correspondent'] }),
    ).rejects.toThrow('No suggestions to apply');

    const result = getAiResult(db, emptyResult.id);
    expect(result!.appliedStatus).toBe('failed');
    expect(result!.failureType).toBe('no_suggestions');
    expect(result!.errorMessage).toBe('No suggestions to apply');
  });

  it('adds ai-processed tag when addProcessedTag is true', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      addProcessedTag: true,
      processedTagName: 'ai-processed',
    });

    // 'ai-processed' is not in the existing tags, so createTag should be called
    expect(client.createTag).toHaveBeenCalledWith('ai-processed');
    // The update should include the ai-processed tag id
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(99);
  });

  it('marks result as applied in DB after successful apply', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['title', 'correspondent', 'documentType', 'tags'],
    });

    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('applied');
  });

  it('marks result as partial when only some fields applied', async () => {
    const client = createMockClient();
    await applyAiResult(db, client, resultId, {
      fields: ['correspondent'],
    });

    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('partial');
  });

  it('merges custom field recommendations with live values without removing unrelated fields', async () => {
    const client = createMockClient();
    db.update(aiProcessingResult)
      .set({
        suggestedCustomFieldsJson: JSON.stringify([
          {
            fieldId: 7,
            value: 'paid-id',
            confidence: 0.95,
            evidence: 'Paid in full',
          },
          {
            fieldId: 8,
            value: '2026-08-01',
            confidence: 0.9,
            evidence: 'Due 1 August 2026',
          },
        ]),
      })
      .run();

    await applyAiResult(db, client, resultId, { fields: ['customFields'] });

    expect(client.updateDocument).toHaveBeenCalledWith(1, {
      customFields: [
        { field: 7, value: 'paid-id' },
        { field: 99, value: 'preserve me' },
        { field: 8, value: '2026-08-01' },
      ],
    });
  });

  it('audits and restores custom fields when an applied result is reverted', async () => {
    const client = createMockClient();
    db.update(aiProcessingResult)
      .set({
        suggestedCustomFieldsJson: JSON.stringify([
          {
            fieldId: 7,
            value: 'paid-id',
            confidence: 0.95,
            evidence: 'Paid in full',
          },
        ]),
      })
      .run();

    await applyAiResult(db, client, resultId, { fields: ['customFields'] });

    const applied = getAiResult(db, resultId);
    expect(applied!.preApplyCustomFields).toEqual([
      { field: 7, value: 'open-id' },
      { field: 99, value: 'preserve me' },
    ]);
    expect(applied!.appliedCustomFields).toEqual([
      { field: 7, value: 'paid-id' },
      { field: 99, value: 'preserve me' },
    ]);

    await revertAiResult(db, client, resultId);

    expect(client.updateDocument).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        customFields: [
          { field: 7, value: 'open-id' },
          { field: 99, value: 'preserve me' },
        ],
      }),
    );
    expect(getAiResult(db, resultId)!.appliedStatus).toBe('reverted');
  });
});

describe('reviewed AI apply plans', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultId = seedDocumentAndResult(db);
    db.update(aiProcessingResult)
      .set({
        suggestedTitle: 'Reviewed title',
        suggestedCustomFieldsJson: JSON.stringify([
          { fieldId: 7, value: 'paid-id', confidence: 0.95, evidence: 'Paid' },
          { fieldId: 8, value: '2026-08-01', confidence: 0.9, evidence: 'Due' },
        ]),
      })
      .run();
  });

  it('rejects an empty field selection before creating a plan', async () => {
    await expect(
      createAiApplyPlan(
        db,
        createMockClient(),
        { type: 'selected_result_ids', resultIds: [resultId] },
        {
          title: false,
          correspondent: false,
          documentType: false,
          tags: false,
          processedTag: false,
          customFieldIds: [],
        },
      ),
    ).rejects.toThrow('At least one AI field must be selected');
  });

  it('freezes ordered result IDs and exact selected custom-field IDs for fifteen minutes', async () => {
    const now = new Date('2026-07-24T10:00:00.000Z');
    const preview = await createAiApplyPlan(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { now, tokenFactory: () => 'opaque-review-token' },
    );

    expect(preview).toMatchObject({
      token: 'opaque-review-token',
      expiresAt: '2026-07-24T10:15:00.000Z',
      resultIds: [resultId],
      selection: {
        title: true,
        customFieldIds: [7],
        processedTag: false,
      },
    });

    const claimed = claimAiMutationPlan(
      db,
      preview.token,
      'ai_apply',
      'job-1',
      new Date('2026-07-24T10:01:00.000Z'),
    );
    expect(claimed.resultIds).toEqual([resultId]);
    expect(claimed.selection.customFieldIds).toEqual([7]);
    expect(JSON.stringify(claimed)).not.toContain('opaque-review-token');
  });

  it('creates and executes a newly reviewed plan after an apply conflict', async () => {
    db.update(aiProcessingResult)
      .set({ appliedStatus: 'failed', failureType: 'review_conflict' })
      .where(eq(aiProcessingResult.id, resultId))
      .run();
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
    );
    const outcome = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'review-conflict-job'),
      'review-conflict-job',
    );

    expect(outcome).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(getAiResult(db, resultId)?.appliedStatus).toBe('partial');
  });

  it('preserves the reviewed request order while stably deduplicating result IDs', async () => {
    db.insert(document)
      .values({
        id: 'doc-order-2',
        paperlessId: 2,
        title: 'Second',
        processingStatus: 'completed',
        syncedAt: '2026-07-24T10:00:00.000Z',
      })
      .run();
    const second = db
      .insert(aiProcessingResult)
      .values({
        id: 'zzzz-order-result',
        documentId: 'doc-order-2',
        paperlessId: 2,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'Second reviewed',
        appliedStatus: 'pending_review',
        createdAt: '2026-07-24T10:00:00.000Z',
      })
      .returning()
      .get();
    const client = createMockClient();
    vi.mocked(client.getDocument).mockImplementation(async (id) => ({
      ...(await createMockClient().getDocument(id)),
      id,
      title: id === 2 ? 'Second' : 'Invoice A',
    }));

    const preview = await createAiApplyPlan(
      db,
      client,
      {
        type: 'selected_result_ids',
        resultIds: [second.id, resultId, second.id],
      },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
    );

    expect(preview.resultIds).toEqual([second.id, resultId]);
  });

  it.each([
    {
      name: 'null title',
      patch: { suggestedTitle: null },
      selection: {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      options: {},
    },
    {
      name: 'uncreatable correspondent',
      patch: { suggestedCorrespondent: 'Not in Paperless' },
      selection: {
        title: false,
        correspondent: true,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      options: { createMissingEntities: false },
    },
    {
      name: 'absent custom recommendation',
      patch: {},
      selection: {
        title: false,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [77],
      },
      options: {},
    },
  ])('skips an unavailable $name without an empty mutation or false audit', async (testCase) => {
    if (Object.keys(testCase.patch).length > 0) {
      db.update(aiProcessingResult)
        .set(testCase.patch)
        .where(eq(aiProcessingResult.id, resultId))
        .run();
    }
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      testCase.selection,
      testCase.options,
    );

    const result = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', `no-op-${testCase.name}`),
      `no-op-${testCase.name}`,
    );

    expect(result).toMatchObject({ applied: 0, skipped: 1, conflicts: 0, failed: 0 });
    expect(result.results).toEqual([{ resultId, status: 'skipped' }]);
    expect(client.updateDocument).not.toHaveBeenCalled();
    expect(getAiResult(db, resultId)).toMatchObject({
      appliedStatus: 'pending_review',
      appliedFields: null,
    });
  });

  it('applies only reviewed fields and preserves unrelated live custom fields', async () => {
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'apply-token' },
    );
    const claimed = claimAiMutationPlan(db, preview.token, 'ai_apply', 'job-apply');

    const result = await executeClaimedAiApplyPlan(db, client, claimed, 'job-apply');

    expect(result).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.createTag).not.toHaveBeenCalledWith('ai-processed');
    expect(client.updateDocument).toHaveBeenCalledWith(1, {
      title: 'Reviewed title',
      customFields: [
        { field: 7, value: 'paid-id' },
        { field: 99, value: 'preserve me' },
      ],
    });
    const stored = getAiResult(db, resultId)!;
    expect(stored.appliedFields).toEqual(['title', 'customField:7']);
    expect(stored.preApplyCustomFields).toEqual([{ field: 7, value: 'open-id' }]);
    expect(stored.appliedCustomFields).toEqual([{ field: 7, value: 'paid-id' }]);
  });

  it('creates and adds the processed tag only when that field is explicitly selected', async () => {
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: false,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: true,
        customFieldIds: [],
      },
      { tokenFactory: () => 'processed-tag-token' },
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'processed-tag-job'),
      'processed-tag-job',
      { processedTagName: 'ai-processed' },
    );

    expect(client.createTag).toHaveBeenCalledWith('ai-processed');
    expect(client.updateDocument).toHaveBeenCalledWith(1, { tags: [99] });
    expect(getAiResult(db, resultId)!.appliedFields).toEqual(['processedTag:99']);
  });

  it('ignores unrelated tag edits for processed-tag apply and preserves them on revert', async () => {
    const client = createMockClient();
    let live = {
      ...(await client.getDocument(1)),
      tags: [1],
    };
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = { ...live, tags: update.tags ?? live.tags };
    });
    const selection = {
      title: false,
      correspondent: false,
      documentType: false,
      tags: false,
      processedTag: true,
      customFieldIds: [],
    };
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      selection,
      { tokenFactory: () => 'processed-tag-isolated-apply' },
    );

    live = { ...live, tags: [1, 2] };
    const applied = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'processed-tag-isolated-apply-job'),
      'processed-tag-isolated-apply-job',
      { processedTagName: 'ai-processed' },
    );

    expect(applied).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(live.tags).toEqual([1, 2, 99]);

    const revertPreview = await createAiRevertPlan(db, client, [resultId], selection, {
      tokenFactory: () => 'processed-tag-isolated-revert',
    });
    live = { ...live, tags: [1, 2, 4, 99] };
    const reverted = await executeClaimedAiRevertPlan(
      db,
      client,
      claimAiMutationPlan(
        db,
        revertPreview.token,
        'ai_revert',
        'processed-tag-isolated-revert-job',
      ),
      'processed-tag-isolated-revert-job',
    );

    expect(reverted).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenLastCalledWith(1, { tags: [1, 2, 4] });
    expect(live.tags).toEqual([1, 2, 4]);
  });

  it.each([
    {
      name: 'tags only',
      selection: {
        title: false,
        correspondent: false,
        documentType: false,
        tags: true,
        processedTag: false,
        customFieldIds: [],
      },
      expectedApplied: [1, 2],
      liveBeforeRevert: [1, 2, 3, 4],
      expectedReverted: [2, 3, 4],
    },
    {
      name: 'tags and processed tag',
      selection: {
        title: false,
        correspondent: false,
        documentType: false,
        tags: true,
        processedTag: true,
        customFieldIds: [],
      },
      expectedApplied: [1, 2, 3],
      liveBeforeRevert: [1, 2, 3, 4],
      expectedReverted: [2, 4],
    },
  ])('reverts the exact audited tag delta for $name', async (testCase) => {
    db.update(aiProcessingResult)
      .set({ suggestedTagsJson: '["finance","shopping"]' })
      .where(eq(aiProcessingResult.id, resultId))
      .run();
    const client = createMockClient();
    const tag = (id: number, name: string) => ({
      id,
      name,
      slug: name,
      color: '#000',
      textColor: '#fff',
      isInboxTag: false,
      matchingAlgorithm: 0,
      match: '',
      documentCount: 0,
    });
    vi.mocked(client.getTags).mockResolvedValue([
      tag(1, 'finance'),
      tag(2, 'shopping'),
      tag(3, 'ai-processed'),
      tag(4, 'unrelated'),
    ]);
    let live = { ...(await client.getDocument(1)), tags: [2] };
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = { ...live, tags: update.tags ?? live.tags };
    });
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      testCase.selection,
      { processedTagName: 'ai-processed' },
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', `tag-apply-${testCase.name}`),
      `tag-apply-${testCase.name}`,
      { processedTagName: 'ai-processed' },
    );
    expect(live.tags).toEqual(testCase.expectedApplied);
    const stored = getAiResult(db, resultId)!;
    if (testCase.selection.processedTag) {
      expect(stored.appliedFields).toContain('processedTag:3');
    }

    live = { ...live, tags: testCase.liveBeforeRevert };
    const revertPreview = await createAiRevertPlan(db, client, [resultId], testCase.selection);
    const reverted = await executeClaimedAiRevertPlan(
      db,
      client,
      claimAiMutationPlan(db, revertPreview.token, 'ai_revert', `tag-revert-${testCase.name}`),
      `tag-revert-${testCase.name}`,
    );

    expect(reverted).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(live.tags).toEqual(testCase.expectedReverted);
  });

  it('preserves a pre-existing processed tag when reverting only combined suggested tags', async () => {
    db.update(aiProcessingResult)
      .set({ suggestedTagsJson: '["finance","shopping"]' })
      .where(eq(aiProcessingResult.id, resultId))
      .run();
    const client = createMockClient();
    const tag = (id: number, name: string) => ({
      id,
      name,
      slug: name,
      color: '#000',
      textColor: '#fff',
      isInboxTag: false,
      matchingAlgorithm: 0,
      match: '',
      documentCount: 0,
    });
    vi.mocked(client.getTags).mockResolvedValue([
      tag(1, 'finance'),
      tag(2, 'shopping'),
      tag(3, 'ai-processed'),
    ]);
    let live = { ...(await client.getDocument(1)), tags: [2, 3] };
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = { ...live, tags: update.tags ?? live.tags };
    });
    const applySelection = {
      title: false,
      correspondent: false,
      documentType: false,
      tags: true,
      processedTag: true,
      customFieldIds: [] as number[],
    };
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      applySelection,
      { processedTagName: 'ai-processed' },
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'preexisting-processed-apply'),
      'preexisting-processed-apply',
      { processedTagName: 'ai-processed' },
    );
    expect(live.tags).toEqual([1, 2, 3]);

    const tagsOnly = { ...applySelection, processedTag: false };
    const revertPreview = await createAiRevertPlan(db, client, [resultId], tagsOnly);
    const reverted = await executeClaimedAiRevertPlan(
      db,
      client,
      claimAiMutationPlan(db, revertPreview.token, 'ai_revert', 'preexisting-processed-revert'),
      'preexisting-processed-revert',
    );

    expect(reverted).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(live.tags).toEqual([2, 3]);
  });

  it('re-fetches live state after reference resolution and preserves a concurrent unrelated edit', async () => {
    const client = createMockClient();
    db.update(aiProcessingResult)
      .set({ suggestedCorrespondent: 'New correspondent' })
      .where(eq(aiProcessingResult.id, resultId))
      .run();
    const original = await client.getDocument(1);
    let reads = 0;
    vi.mocked(client.getDocument).mockImplementation(async () => {
      reads++;
      return reads < 3
        ? original
        : {
            ...original,
            customFields: [
              { field: 7, value: 'open-id' },
              { field: 99, value: 'edited during reference resolution' },
            ],
          };
    });
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: false,
        correspondent: true,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
    );

    const result = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'final-live-race'),
      'final-live-race',
    );

    expect(result).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        customFields: [
          { field: 7, value: 'paid-id' },
          { field: 99, value: 'edited during reference resolution' },
        ],
      }),
    );
  });

  it.each([
    new PaperlessApiError('rate limited', 429),
    new PaperlessApiError('server unavailable', 503),
    new Error('network socket disconnected'),
  ])('leaves the plan retryable for transient Paperless failure %#', async (failure) => {
    const client = createMockClient();
    vi.mocked(client.updateDocument).mockRejectedValue(failure);
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
    );
    const claimed = claimAiMutationPlan(db, preview.token, 'ai_apply', 'transient-job');

    await expect(executeClaimedAiApplyPlan(db, client, claimed, 'transient-job')).rejects.toThrow();
    const plan = db.select().from(reviewedMutationPlan).get()!;
    expect(plan.completedAt).toBeNull();
    expect(plan.consumedAt).toBeNull();
  });

  it('records a missing Paperless document and continues applying later reviewed documents', async () => {
    db.insert(document)
      .values({
        id: 'doc-after-missing',
        paperlessId: 2,
        title: 'Second invoice',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();
    const secondResult = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-after-missing',
        paperlessId: 2,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'Reviewed second invoice',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();
    const client = createMockClient();
    let firstDocumentReads = 0;
    vi.mocked(client.getDocument).mockImplementation(async (paperlessId) => {
      if (paperlessId === 1 && firstDocumentReads++ > 0) {
        throw new PaperlessApiError('document not found', 404);
      }
      return {
        ...(await createMockClient().getDocument(paperlessId)),
        id: paperlessId,
        title: paperlessId === 2 ? 'Second invoice' : 'Invoice A',
      };
    });
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId, secondResult.id] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
    );

    const outcome = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'missing-document-job'),
      'missing-document-job',
    );

    expect(outcome).toMatchObject({ applied: 1, conflicts: 0, failed: 1 });
    expect(client.updateDocument).toHaveBeenCalledOnce();
    expect(client.updateDocument).toHaveBeenCalledWith(2, {
      title: 'Reviewed second invoice',
    });
    const plan = db.select().from(reviewedMutationPlan).get()!;
    expect(plan.completedAt).not.toBeNull();
    expect(plan.consumedAt).not.toBeNull();
  });

  it('conflicts a live reviewed-field edit without marking extraction failed', async () => {
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'conflict-token' },
    );
    vi.mocked(client.getDocument).mockResolvedValueOnce({
      ...(await client.getDocument(1)),
      title: 'Edited after review',
    });

    const result = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'job-conflict'),
      'job-conflict',
    );

    expect(result).toMatchObject({ applied: 0, conflicts: 1, failed: 0 });
    expect(client.updateDocument).not.toHaveBeenCalled();
    const stored = getAiResult(db, resultId)!;
    expect(stored.appliedStatus).toBe('pending_review');
    expect(stored.failureType).toBeNull();
  });

  it('continues an apply batch after a field-level conflict on another document', async () => {
    db.insert(document)
      .values({
        id: 'doc-2',
        paperlessId: 2,
        title: 'Second original',
        processingStatus: 'completed',
        syncedAt: '2026-07-24T10:00:00.000Z',
      })
      .run();
    const second = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-2',
        paperlessId: 2,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'Second reviewed',
        appliedStatus: 'pending_review',
        createdAt: '2026-07-24T10:00:00.000Z',
      })
      .returning()
      .get();
    const client = createMockClient();
    const firstLive = await client.getDocument(1);
    const live = new Map([
      [1, firstLive],
      [2, { ...firstLive, id: 2, title: 'Second original' }],
    ]);
    vi.mocked(client.getDocument).mockImplementation(async (id) => live.get(id)!);
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId, second.id] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'partial-batch-token' },
    );
    live.set(2, { ...live.get(2)!, title: 'Edited after review' });

    const result = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'partial-batch-job'),
      'partial-batch-job',
    );

    expect(result).toMatchObject({ applied: 1, conflicts: 1, failed: 0 });
    expect(result.results).toEqual(
      expect.arrayContaining([
        { resultId, status: 'applied' },
        { resultId: second.id, status: 'conflict', conflictFields: ['title'] },
      ]),
    );
    expect(client.updateDocument).toHaveBeenCalledTimes(1);
    expect(getAiResult(db, second.id)!.appliedStatus).toBe('pending_review');
  });

  it('does not include results that begin matching the scope after preview', async () => {
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'all_pending' },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'frozen-scope-token' },
    );
    db.insert(document)
      .values({
        id: 'doc-new',
        paperlessId: 2,
        title: 'New',
        processingStatus: 'completed',
        syncedAt: '2026-07-24T10:00:00.000Z',
      })
      .run();
    const newResult = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-new',
        paperlessId: 2,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'New suggestion',
        appliedStatus: 'pending_review',
        createdAt: '2026-07-24T10:00:00.000Z',
      })
      .returning()
      .get();

    const claimed = claimAiMutationPlan(db, preview.token, 'ai_apply', 'job-frozen');
    expect(claimed.resultIds).toEqual([resultId]);
    expect(claimed.resultIds).not.toContain(newResult.id);
  });

  it('conflicts when a reviewed suggestion is reprocessed before execution', async () => {
    const client = createMockClient();
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'reprocessed-token' },
    );
    db.update(aiProcessingResult)
      .set({
        suggestedTitle: 'Replacement suggestion',
        createdAt: '2026-07-24T11:00:00.000Z',
      })
      .where(eq(aiProcessingResult.id, resultId))
      .run();

    const result = await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, preview.token, 'ai_apply', 'reprocessed-job'),
      'reprocessed-job',
    );

    expect(result).toMatchObject({ applied: 0, conflicts: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ conflictFields: ['suggestion'] });
    expect(client.updateDocument).not.toHaveBeenCalled();
  });

  it('rejects expired plans and prevents a different job reusing a claimed plan', async () => {
    const preview = await createAiApplyPlan(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      {
        now: new Date('2026-07-24T10:00:00.000Z'),
        tokenFactory: () => 'single-use-token',
      },
    );
    expect(() =>
      claimAiMutationPlan(
        db,
        preview.token,
        'ai_apply',
        'late-job',
        new Date('2026-07-24T10:16:00.000Z'),
      ),
    ).toThrow('expired');

    const second = await createAiApplyPlan(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'claimed-token' },
    );
    claimAiMutationPlan(db, second.token, 'ai_apply', 'first-job');
    expect(() => claimAiMutationPlan(db, second.token, 'ai_apply', 'other-job')).toThrow('claimed');
  });

  it('rejects a corrupted AI plan with a bounded mutation-plan error', async () => {
    const preview = await createAiApplyPlan(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [],
      },
      { tokenFactory: () => 'corrupt-plan-token' },
    );
    db.update(reviewedMutationPlan).set({ payloadJson: '{"resultIds":' }).run();

    expect(() => claimAiMutationPlan(db, preview.token, 'ai_apply', 'corrupt-job')).toThrow(
      'invalid payload',
    );
  });

  it('allows only one of two file-backed connections to claim an AI plan', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-review-claim-'));
    const databasePath = join(directory, 'claim.sqlite');
    const handle = createDatabaseWithHandle(databasePath);
    try {
      await migrateDatabase(handle.sqlite);
      const fileResultId = seedDocumentAndResult(handle.db);
      handle.db.update(aiProcessingResult).set({ suggestedTitle: 'Reviewed title' }).run();
      const preview = await createAiApplyPlan(
        handle.db,
        createMockClient(),
        { type: 'selected_result_ids', resultIds: [fileResultId] },
        {
          title: true,
          correspondent: false,
          documentType: false,
          tags: false,
          processedTag: false,
          customFieldIds: [],
        },
        {
          now: new Date('2026-07-24T10:00:00.000Z'),
          tokenFactory: () => 'concurrent-ai-review-token-000000000001',
        },
      );
      handle.sqlite.close();
      const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const view = new Int32Array(barrier);
      const workers = ['job-one', 'job-two'].map(
        (jobId) =>
          new Worker(new URL('./fixtures/claim-ai-plan-worker.ts', import.meta.url), {
            workerData: { databasePath, token: preview.token, jobId, barrier },
            execArgv: ['--import', 'tsx'],
          }),
      );
      const results = await new Promise<Array<{ status: string; reason?: string }>>(
        (resolve, reject) => {
          let ready = 0;
          const received: Array<{ status: string; reason?: string }> = [];
          for (const worker of workers) {
            worker.on('error', reject);
            worker.on('message', (message: { type: string; status?: string; reason?: string }) => {
              if (message.type === 'ready') {
                ready++;
                if (ready === workers.length) {
                  Atomics.store(view, 0, 1);
                  Atomics.notify(view, 0, workers.length);
                }
              } else if (message.type === 'result' && message.status) {
                received.push({ status: message.status, reason: message.reason });
                if (received.length === workers.length) resolve(received);
              }
            });
          }
        },
      );
      expect(results).toEqual(
        expect.arrayContaining([
          { status: 'claimed', reason: undefined },
          { status: 'rejected', reason: 'claimed' },
        ]),
      );
      await Promise.all(workers.map((worker) => worker.terminate()));
    } finally {
      if (handle.sqlite.open) handle.sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reverts only reviewed title and custom field when live applied values still match', async () => {
    const client = createMockClient();
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'apply-before-revert' },
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'apply-job'),
      'apply-job',
    );
    vi.mocked(client.getDocument).mockResolvedValue({
      ...(await client.getDocument(1)),
      title: 'Reviewed title',
      customFields: [
        { field: 7, value: 'paid-id' },
        { field: 99, value: 'changed independently' },
      ],
    });

    const revertPreview = await createAiRevertPlan(
      db,
      client,
      [resultId],
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'revert-token' },
    );
    const reverted = await executeClaimedAiRevertPlan(
      db,
      client,
      claimAiMutationPlan(db, revertPreview.token, 'ai_revert', 'revert-job'),
      'revert-job',
    );

    expect(reverted).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenLastCalledWith(1, {
      title: 'Invoice A',
      customFields: [
        { field: 7, value: 'open-id' },
        { field: 99, value: 'changed independently' },
      ],
    });
    expect(getAiResult(db, resultId)!.appliedStatus).toBe('reverted');
  });

  it('reconciles apply after Paperless success without repeating the remote mutation', async () => {
    const client = createMockClient();
    let live = await client.getDocument(1);
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = {
        ...live,
        title: update.title ?? live.title,
        customFields: update.customFields ?? live.customFields,
      };
    });
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'crash-apply-token' },
    );
    const claimed = claimAiMutationPlan(db, preview.token, 'ai_apply', 'crash-apply-job');

    const crashed = await executeClaimedAiApplyPlan(db, client, claimed, 'crash-apply-job', {
      afterRemoteMutation: () => {
        throw new Error('simulated process crash');
      },
    });
    expect(crashed.failed).toBe(1);
    expect(client.updateDocument).toHaveBeenCalledTimes(1);

    const recovered = await executeClaimedAiApplyPlan(db, client, claimed, 'crash-apply-job');
    expect(recovered).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenCalledTimes(1);
    expect(getAiResult(db, resultId)!.appliedStatus).toBe('partial');
  });

  it('reconciles revert after Paperless success without repeating the remote mutation', async () => {
    const client = createMockClient();
    let live = await client.getDocument(1);
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = {
        ...live,
        title: update.title ?? live.title,
        customFields: update.customFields ?? live.customFields,
      };
    });
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'crash-revert-apply-token' },
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'before-revert-job'),
      'before-revert-job',
    );
    const revertPreview = await createAiRevertPlan(
      db,
      client,
      [resultId],
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
      { tokenFactory: () => 'crash-revert-token' },
    );
    const claimed = claimAiMutationPlan(db, revertPreview.token, 'ai_revert', 'crash-revert-job');
    vi.mocked(client.updateDocument).mockClear();

    const crashed = await executeClaimedAiRevertPlan(db, client, claimed, 'crash-revert-job', {
      afterRemoteMutation: () => {
        throw new Error('simulated process crash');
      },
    });
    expect(crashed.failed).toBe(1);
    expect(client.updateDocument).toHaveBeenCalledTimes(1);

    const recovered = await executeClaimedAiRevertPlan(db, client, claimed, 'crash-revert-job');
    expect(recovered).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenCalledTimes(1);
    expect(getAiResult(db, resultId)!.appliedStatus).toBe('reverted');
  });

  it('reconciles a selective custom-field revert after remote success and preserves other applied fields', async () => {
    const client = createMockClient();
    let live: Awaited<ReturnType<PaperlessClient['getDocument']>> = {
      ...(await client.getDocument(1)),
      customFields: [
        { field: 7, value: 'open-id' },
        { field: 99, value: 'preserve me' },
        { field: 8, value: '2025-01-01' },
      ],
    };
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = {
        ...live,
        customFields: update.customFields ?? live.customFields,
      };
    });
    const applySelection = {
      title: false,
      correspondent: false,
      documentType: false,
      tags: false,
      processedTag: false,
      customFieldIds: [7, 8],
    };
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      applySelection,
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'selective-cf-apply'),
      'selective-cf-apply',
    );
    expect(live.customFields).toEqual([
      { field: 7, value: 'paid-id' },
      { field: 99, value: 'preserve me' },
      { field: 8, value: '2026-08-01' },
    ]);

    const revertSelection = { ...applySelection, customFieldIds: [7] };
    const revertPreview = await createAiRevertPlan(db, client, [resultId], revertSelection);
    const claimed = claimAiMutationPlan(
      db,
      revertPreview.token,
      'ai_revert',
      'selective-cf-revert',
    );
    vi.mocked(client.updateDocument).mockClear();

    const crashed = await executeClaimedAiRevertPlan(db, client, claimed, 'selective-cf-revert', {
      afterRemoteMutation: () => {
        throw new Error('simulated process crash');
      },
    });
    expect(crashed.failed).toBe(1);
    expect(client.updateDocument).toHaveBeenCalledOnce();
    expect(live.customFields).toEqual([
      { field: 7, value: 'open-id' },
      { field: 99, value: 'preserve me' },
      { field: 8, value: '2026-08-01' },
    ]);

    const recovered = await executeClaimedAiRevertPlan(db, client, claimed, 'selective-cf-revert');

    expect(recovered).toMatchObject({ applied: 1, conflicts: 0, failed: 0 });
    expect(client.updateDocument).toHaveBeenCalledOnce();
    expect(getAiResult(db, resultId)).toMatchObject({
      appliedStatus: 'partial',
      appliedFields: ['customField:8'],
    });
    expect(db.select().from(document).where(eq(document.id, 'doc-1')).get()).toMatchObject({
      customFieldsJson: JSON.stringify([
        { field: 7, value: 'open-id' },
        { field: 99, value: 'preserve me' },
        { field: 8, value: '2026-08-01' },
      ]),
    });
  });

  it('leaves a revert plan retryable after a transient Paperless failure', async () => {
    const client = createMockClient();
    const selection = {
      title: true,
      correspondent: false,
      documentType: false,
      tags: false,
      processedTag: false,
      customFieldIds: [] as number[],
    };
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      selection,
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'revert-transient-apply'),
      'revert-transient-apply',
    );
    vi.mocked(client.getDocument).mockResolvedValue({
      ...(await createMockClient().getDocument(1)),
      title: 'Reviewed title',
    });
    const revertPreview = await createAiRevertPlan(db, client, [resultId], selection);
    vi.mocked(client.updateDocument).mockRejectedValue(
      new PaperlessApiError('server unavailable', 503),
    );
    const claimed = claimAiMutationPlan(
      db,
      revertPreview.token,
      'ai_revert',
      'revert-transient-job',
    );

    await expect(
      executeClaimedAiRevertPlan(db, client, claimed, 'revert-transient-job'),
    ).rejects.toThrow('server unavailable');
    const plan = db
      .select()
      .from(reviewedMutationPlan)
      .where(eq(reviewedMutationPlan.id, claimed.planId))
      .get()!;
    expect(plan.completedAt).toBeNull();
    expect(plan.consumedAt).toBeNull();
  });

  it('repairs the local cache when replaying after apply status commit', async () => {
    const client = createMockClient();
    let live = await client.getDocument(1);
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = {
        ...live,
        title: update.title ?? live.title,
        customFields: update.customFields ?? live.customFields,
      };
    });
    const preview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        title: true,
        correspondent: false,
        documentType: false,
        tags: false,
        processedTag: false,
        customFieldIds: [7],
      },
    );
    const claimed = claimAiMutationPlan(db, preview.token, 'ai_apply', 'apply-cache-replay');
    await executeClaimedAiApplyPlan(db, client, claimed, 'apply-cache-replay');
    vi.mocked(client.updateDocument).mockClear();
    db.update(document)
      .set({
        title: 'stale local title',
        customFieldsJson: JSON.stringify([{ field: 7, value: 'open-id' }]),
      })
      .where(eq(document.id, 'doc-1'))
      .run();
    db.update(reviewedMutationPlan).set({ completedAt: null, consumedAt: null }).run();

    await executeClaimedAiApplyPlan(db, client, claimed, 'apply-cache-replay');

    expect(client.updateDocument).not.toHaveBeenCalled();
    expect(db.select().from(document).where(eq(document.id, 'doc-1')).get()).toMatchObject({
      title: 'Reviewed title',
      customFieldsJson: JSON.stringify([
        { field: 7, value: 'paid-id' },
        { field: 99, value: 'preserve me' },
      ]),
    });
  });

  it('repairs the local cache when replaying after revert status commit', async () => {
    const client = createMockClient();
    let live = await client.getDocument(1);
    vi.mocked(client.getDocument).mockImplementation(async () => live);
    vi.mocked(client.updateDocument).mockImplementation(async (_id, update) => {
      live = {
        ...live,
        title: update.title ?? live.title,
        customFields: update.customFields ?? live.customFields,
      };
    });
    const selection = {
      title: true,
      correspondent: false,
      documentType: false,
      tags: false,
      processedTag: false,
      customFieldIds: [7],
    };
    const applyPreview = await createAiApplyPlan(
      db,
      client,
      { type: 'selected_result_ids', resultIds: [resultId] },
      selection,
    );
    await executeClaimedAiApplyPlan(
      db,
      client,
      claimAiMutationPlan(db, applyPreview.token, 'ai_apply', 'revert-cache-apply'),
      'revert-cache-apply',
    );
    const revertPreview = await createAiRevertPlan(db, client, [resultId], selection);
    const claimed = claimAiMutationPlan(
      db,
      revertPreview.token,
      'ai_revert',
      'revert-cache-replay',
    );
    await executeClaimedAiRevertPlan(db, client, claimed, 'revert-cache-replay');
    vi.mocked(client.updateDocument).mockClear();
    db.update(document)
      .set({
        title: 'Reviewed title',
        customFieldsJson: JSON.stringify([{ field: 7, value: 'paid-id' }]),
      })
      .where(eq(document.id, 'doc-1'))
      .run();
    db.update(reviewedMutationPlan).set({ completedAt: null, consumedAt: null }).run();

    await executeClaimedAiRevertPlan(db, client, claimed, 'revert-cache-replay');

    expect(client.updateDocument).not.toHaveBeenCalled();
    expect(db.select().from(document).where(eq(document.id, 'doc-1')).get()).toMatchObject({
      title: 'Invoice A',
      customFieldsJson: JSON.stringify([
        { field: 7, value: 'open-id' },
        { field: 99, value: 'preserve me' },
      ]),
    });
  });
});

describe('applyAiResult - safe defaults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedResultWithNullSuggestions(
    overrides: Partial<{
      suggestedCorrespondent: string | null;
      suggestedDocumentType: string | null;
      suggestedTagsJson: string | null;
    }> = {},
  ): string {
    db.insert(document)
      .values({
        id: 'doc-safe',
        paperlessId: 10,
        title: 'Safe Test Doc',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const result = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-safe',
        paperlessId: 10,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: null,
        suggestedDocumentType: null,
        suggestedTagsJson: '["finance"]',
        confidenceJson: '{"correspondent":0.5,"documentType":0.5,"tags":0.5}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
      })
      .returning()
      .get();

    return result.id;
  }

  it('does not clear existing correspondent when suggestion is null (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
    expect(updateArg).toHaveProperty('tags');
  });

  it('does not clear existing document type when suggestion is null (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedDocumentType: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['documentType', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('documentType');
  });

  it('does not clear existing tags when suggestions are empty (default)', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'Amazon',
      suggestedTagsJson: '[]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent');
    expect(updateArg).not.toHaveProperty('tags');
  });

  it('clears correspondent when allowClearing is true and suggestion is null', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: null,
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
      allowClearing: true,
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).toHaveProperty('correspondent', null);
  });

  it('does not create new entity when createMissingEntities is false', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'HMRC',
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
      createMissingEntities: false,
    });

    expect(client.createCorrespondent).not.toHaveBeenCalled();
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
  });

  it('never creates a correspondent named "unknown"', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'unknown',
      suggestedTagsJson: '["finance"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    expect(client.createCorrespondent).not.toHaveBeenCalled();
    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('correspondent');
  });

  it('never creates a tag named "unknown"', async () => {
    const resultId = seedResultWithNullSuggestions({
      suggestedCorrespondent: 'Amazon',
      suggestedTagsJson: '["finance","unknown"]',
    });
    const client = createMockClient();

    await applyAiResult(db, client, resultId, {
      fields: ['correspondent', 'tags'],
    });

    expect(client.createTag).not.toHaveBeenCalledWith('unknown');
    expect(client.createTag).not.toHaveBeenCalledWith('Unknown');
  });
});

describe('applyAiResult - protected tags', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  function seedForProtectedTags(suggestedTags: string[]): string {
    db.insert(document)
      .values({
        id: 'doc-pt',
        paperlessId: 1,
        title: 'Protected Tag Test',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    const result = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-pt',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Amazon',
        suggestedDocumentType: 'Invoice',
        suggestedTagsJson: JSON.stringify(suggestedTags),
        confidenceJson: '{"correspondent":0.9,"documentType":0.95,"tags":0.8}',
        appliedStatus: 'pending_review',
        promptTokens: 100,
        completionTokens: 50,
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    return result.id;
  }

  function createMockClientWithTags(currentTags: number[] = []) {
    return {
      getCorrespondents: vi
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Amazon', slug: 'amazon', matchingAlgorithm: 0 }]),
      getDocumentTypes: vi
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Invoice', slug: 'invoice', matchingAlgorithm: 0 }]),
      getTags: vi.fn().mockResolvedValue([
        { id: 1, name: 'finance', slug: 'finance', color: '#000' },
        { id: 2, name: 'shopping', slug: 'shopping', color: '#000' },
        { id: 3, name: 'email', slug: 'email', color: '#000' },
      ]),
      createCorrespondent: vi.fn(),
      createDocumentType: vi.fn(),
      createTag: vi
        .fn()
        .mockImplementation((name: string) =>
          Promise.resolve({ id: 99, name, slug: name.toLowerCase(), color: '#000' }),
        ),
      updateDocument: vi.fn().mockResolvedValue(undefined),
      getDocument: vi.fn().mockResolvedValue({
        id: 1,
        title: 'Protected Tag Test',
        content: '',
        tags: currentTags,
        correspondent: null,
        documentType: null,
        created: '2024-01-01T00:00:00Z',
        modified: '2024-01-01T00:00:00Z',
        added: '2024-01-01T00:00:00Z',
        originalFileName: null,
        archivedFileName: null,
        archiveSerialNumber: null,
      }),
    } as unknown as PaperlessClient;
  }

  it('filters protected tag from AI suggestions', async () => {
    const resultId = seedForProtectedTags(['finance', 'email']);
    const client = createMockClientWithTags();

    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      protectedTagsEnabled: true,
      protectedTagNames: ['email'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(1); // finance
    expect(updateArg.tags).not.toContain(3); // email filtered
  });

  it('preserves protected tag already on document', async () => {
    const resultId = seedForProtectedTags(['finance']);
    const client = createMockClientWithTags([3]); // document has email tag

    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      protectedTagsEnabled: true,
      protectedTagNames: ['email'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(1); // finance (from AI)
    expect(updateArg.tags).toContain(3); // email (preserved)
  });

  it('matches protected tags case-insensitively', async () => {
    const resultId = seedForProtectedTags(['finance', 'Email']);
    const client = createMockClientWithTags([3]); // document has email tag (id 3)

    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      protectedTagsEnabled: true,
      protectedTagNames: ['EMAIL'], // uppercase in config
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(1); // finance
    expect(updateArg.tags).toContain(3); // email preserved
    // 'Email' from suggestions should have been filtered (case-insensitive)
    expect(updateArg.tags).toHaveLength(2);
  });

  it('does not filter when protectedTagsEnabled is false', async () => {
    const resultId = seedForProtectedTags(['finance', 'email']);
    const client = createMockClientWithTags();

    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      protectedTagsEnabled: false,
      protectedTagNames: ['email'],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(1); // finance
    expect(updateArg.tags).toContain(3); // email NOT filtered when disabled
  });

  it('does not filter when protectedTagNames is empty', async () => {
    const resultId = seedForProtectedTags(['finance', 'email']);
    const client = createMockClientWithTags();

    await applyAiResult(db, client, resultId, {
      fields: ['tags'],
      protectedTagsEnabled: true,
      protectedTagNames: [],
    });

    const updateArg = vi.mocked(client.updateDocument).mock.calls[0][1];
    expect(updateArg.tags).toContain(1); // finance
    expect(updateArg.tags).toContain(3); // email not filtered (empty list)
  });
});

describe('rejectAiResult', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
    resultId = seedDocumentAndResult(db);
  });

  it('marks result as rejected in DB', () => {
    rejectAiResult(db, resultId);
    const result = getAiResult(db, resultId);
    expect(result!.appliedStatus).toBe('rejected');
  });
});

describe('batchRejectAiResults', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('marks all IDs as rejected', () => {
    // Seed multiple docs and results
    db.insert(document)
      .values([
        {
          id: 'doc-a',
          paperlessId: 10,
          title: 'Doc A',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc-b',
          paperlessId: 11,
          title: 'Doc B',
          processingStatus: 'completed',
          syncedAt: '2024-01-01T00:00:00Z',
        },
      ])
      .run();

    const r1 = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-a',
        paperlessId: 10,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Test',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    const r2 = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-b',
        paperlessId: 11,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedCorrespondent: 'Test',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get();

    batchRejectAiResults(db, [r1.id, r2.id]);

    expect(getAiResult(db, r1.id)!.appliedStatus).toBe('rejected');
    expect(getAiResult(db, r2.id)!.appliedStatus).toBe('rejected');
  });
});
