import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseWithHandle } from '../../db/client.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { document } from '../../schema/sqlite/documents.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import type { PaperlessClient } from '../../paperless/client.js';
import type { AiApplyField } from '../apply.js';
import { setAiConfig } from '../config.js';
import { computeApplyPreflight } from '../preflight.js';
import type { ApplyScope } from '../scopes.js';

function createMockClient(): PaperlessClient {
  return {
    getCorrespondents: vi.fn().mockResolvedValue([]),
    getDocumentTypes: vi.fn().mockResolvedValue([]),
    getTags: vi.fn().mockResolvedValue([]),
  } as unknown as PaperlessClient;
}

describe('computeApplyPreflight', () => {
  let db: AppDatabase;
  let resultId: string;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);

    db.insert(document)
      .values({
        id: 'doc-1',
        paperlessId: 1,
        title: 'Invoice',
        processingStatus: 'completed',
        syncedAt: '2024-01-01T00:00:00Z',
      })
      .run();

    resultId = db
      .insert(aiProcessingResult)
      .values({
        documentId: 'doc-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        suggestedTitle: 'April Invoice',
        confidenceJson: '{"title":0.75,"correspondent":0,"documentType":0,"tags":0}',
        appliedStatus: 'pending_review',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .returning()
      .get().id;
  });

  async function tagPreview(current: string[], suggested: string[], allowClearing = false) {
    db.update(aiProcessingResult)
      .set({
        currentTagsJson: JSON.stringify(current),
        suggestedTagsJson: JSON.stringify(suggested),
      })
      .where(eq(aiProcessingResult.id, resultId))
      .run();
    return computeApplyPreflight(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      {
        fields: ['tags'],
        allowClearing,
        createMissingEntities: true,
      },
    );
  }

  it('counts five removals when three of eight current tags are retained', async () => {
    const preview = await tagPreview(
      ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'],
      ['one', 'TWO', 'Three'],
    );
    expect(preview).toMatchObject({
      tagsRemoved: 5,
      documentsLosingTags: 1,
      fieldsChanged: { tags: 1 },
      noOpCount: 0,
      destructiveClearCount: 0,
    });
  });

  it('counts clearing tags as a destructive change', async () => {
    const preview = await tagPreview(['One', 'Two'], [], true);
    expect(preview).toMatchObject({
      tagsRemoved: 2,
      documentsLosingTags: 1,
      fieldsChanged: { tags: 1 },
      noOpCount: 0,
      destructiveClearCount: 1,
    });
  });

  it('preserves protected current tags and excludes protected suggestions from new tags', async () => {
    setAiConfig(db, { protectedTagsEnabled: true, protectedTagNames: ['Keep', 'Never create'] });
    const preview = await tagPreview(['KEEP', 'Remove'], ['keep', 'NEVER CREATE', 'New']);
    expect(preview).toMatchObject({
      tagsRemoved: 1,
      documentsLosingTags: 1,
      fieldsChanged: { tags: 1 },
      newEntitiesCreated: { tags: ['New'] },
    });
  });

  it('counts removals when keeping a protected tag makes apply write tags', async () => {
    setAiConfig(db, { protectedTagsEnabled: true, protectedTagNames: ['Keep'] });
    const preview = await tagPreview(['KEEP', 'Remove'], []);
    expect(preview).toMatchObject({
      tagsRemoved: 1,
      documentsLosingTags: 1,
      fieldsChanged: { tags: 1 },
      noOpCount: 0,
      destructiveClearCount: 0,
    });
  });

  it('counts clearing unprotected tags while preserving protected ones', async () => {
    setAiConfig(db, { protectedTagsEnabled: true, protectedTagNames: ['Keep'] });
    const preview = await tagPreview(['KEEP', 'Remove'], ['keep'], true);
    expect(preview).toMatchObject({
      tagsRemoved: 1,
      documentsLosingTags: 1,
      fieldsChanged: { tags: 1 },
      noOpCount: 0,
      destructiveClearCount: 1,
    });
  });

  it.each([
    [['Existing'], [], false],
    [['KEEP'], ['keep'], false],
    [['Existing'], ['Protected absent'], false],
    [[], [], true],
  ] as const)(
    'keeps no-op accounting when tags stay unchanged: %j',
    async (current, suggested, allowClearing) => {
      setAiConfig(db, {
        protectedTagsEnabled: true,
        protectedTagNames: ['Keep', 'Protected absent'],
      });
      const preview = await tagPreview([...current], [...suggested], allowClearing);
      expect(preview).toMatchObject({
        tagsRemoved: 0,
        documentsLosingTags: 0,
        fieldsChanged: { tags: 0 },
        noOpCount: 1,
        destructiveClearCount: 0,
        newEntitiesCreated: { tags: [] },
      });
    },
  );

  it('does not count removals when tags are not selected', async () => {
    db.update(aiProcessingResult)
      .set({ currentTagsJson: '["Existing"]', suggestedTagsJson: '[]' })
      .run();
    const preview = await computeApplyPreflight(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [resultId] },
      { fields: ['title'], allowClearing: true, createMissingEntities: true },
    );
    expect(preview).toMatchObject({
      tagsRemoved: 0,
      documentsLosingTags: 0,
      fieldsChanged: { tags: 0 },
      destructiveClearCount: 0,
    });
  });

  it('returns numeric zero counts for an empty selection', async () => {
    const preview = await computeApplyPreflight(
      db,
      createMockClient(),
      { type: 'selected_result_ids', resultIds: [] },
      { fields: ['tags'], allowClearing: true, createMissingEntities: true },
    );
    expect(preview).toMatchObject({ totalDocuments: 0, tagsRemoved: 0, documentsLosingTags: 0 });
  });

  it('uses configured thresholds to flag suggestions for human review without auto-apply eligibility', async () => {
    const scope: ApplyScope = { type: 'selected_result_ids', resultIds: [resultId] };
    const options = {
      fields: ['title'] as AiApplyField[],
      allowClearing: false,
      createMissingEntities: false,
    };

    const beforeThreshold = await computeApplyPreflight(db, createMockClient(), scope, options);
    expect(beforeThreshold.lowConfidenceCount).toBe(0);

    setAiConfig(db, { confidenceThresholdTitle: 0.8 });

    const afterThreshold = await computeApplyPreflight(db, createMockClient(), scope, options);
    expect(afterThreshold.lowConfidenceCount).toBe(1);
    expect(afterThreshold).not.toHaveProperty('gateResults');
  });
});
