import { beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseWithHandle, type AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { computeAnalysisConfigHash, saveAnalysisConfigHash } from '../../dedup/analysis-hash.js';
import { getDedupConfig } from '../../dedup/config.js';
import { aiProcessingResult } from '../../schema/sqlite/ai-processing.js';
import { syncState } from '../../schema/sqlite/app.js';
import { document } from '../../schema/sqlite/documents.js';
import { duplicateGroup } from '../../schema/sqlite/duplicates.js';
import { job } from '../../schema/sqlite/jobs.js';
import { buildNextActions, getReadiness } from '../readiness.js';

const now = new Date('2026-07-23T12:00:00.000Z');

describe('readiness and next actions', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it.each([
    {
      name: 'never-synced library',
      seed: () => undefined,
      expected: {
        lastSyncAt: null,
        lastAnalysisAt: null,
        analysisStale: false,
        failedJobCount: 0,
        pendingDuplicateGroups: 0,
        pendingAiResults: 0,
        actionIds: ['sync-library'],
      },
    },
    {
      name: 'stale analysis after a sync',
      seed: (database: AppDatabase) => {
        database
          .insert(syncState)
          .values({
            id: 'singleton',
            lastSyncAt: '2026-07-23T11:00:00.000Z',
            lastAnalysisAt: '2026-07-22T11:00:00.000Z',
          })
          .run();
      },
      expected: {
        lastSyncAt: '2026-07-23T11:00:00.000Z',
        lastAnalysisAt: '2026-07-22T11:00:00.000Z',
        analysisStale: true,
        failedJobCount: 0,
        pendingDuplicateGroups: 0,
        pendingAiResults: 0,
        actionIds: ['run-analysis'],
      },
    },
    {
      name: 'failed jobs before lower-priority work',
      seed: (database: AppDatabase) => {
        seedHealthyState(database);
        database
          .insert(job)
          .values({
            id: 'failed-sync',
            type: 'sync',
            status: 'failed',
            createdAt: now.toISOString(),
          })
          .run();
      },
      expected: {
        lastSyncAt: '2026-07-23T11:00:00.000Z',
        lastAnalysisAt: '2026-07-23T11:30:00.000Z',
        analysisStale: false,
        failedJobCount: 1,
        pendingDuplicateGroups: 0,
        pendingAiResults: 0,
        actionIds: ['retry-failed-jobs'],
      },
    },
    {
      name: 'pending duplicate groups',
      seed: (database: AppDatabase) => {
        seedHealthyState(database);
        database
          .insert(duplicateGroup)
          .values({
            id: 'pending-group',
            confidenceScore: 0.9,
            algorithmVersion: 'v1',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .run();
      },
      expected: {
        lastSyncAt: '2026-07-23T11:00:00.000Z',
        lastAnalysisAt: '2026-07-23T11:30:00.000Z',
        analysisStale: false,
        failedJobCount: 0,
        pendingDuplicateGroups: 1,
        pendingAiResults: 0,
        actionIds: ['review-duplicates'],
      },
    },
    {
      name: 'pending AI review',
      seed: (database: AppDatabase) => {
        seedHealthyState(database);
        seedDocument(database);
        database
          .insert(aiProcessingResult)
          .values({
            id: 'pending-ai',
            documentId: 'document-1',
            paperlessId: 1,
            provider: 'openai',
            model: 'gpt-test',
            createdAt: now.toISOString(),
          })
          .run();
      },
      expected: {
        lastSyncAt: '2026-07-23T11:00:00.000Z',
        lastAnalysisAt: '2026-07-23T11:30:00.000Z',
        analysisStale: false,
        failedJobCount: 0,
        pendingDuplicateGroups: 0,
        pendingAiResults: 1,
        actionIds: ['review-ai-results'],
      },
    },
    {
      name: 'healthy library',
      seed: seedHealthyState,
      expected: {
        lastSyncAt: '2026-07-23T11:00:00.000Z',
        lastAnalysisAt: '2026-07-23T11:30:00.000Z',
        analysisStale: false,
        failedJobCount: 0,
        pendingDuplicateGroups: 0,
        pendingAiResults: 0,
        actionIds: [],
      },
    },
  ])('$name produces the expected local readiness and actions', ({ seed, expected }) => {
    seed(db);

    const readiness = getReadiness(db, now);

    expect(readiness).toMatchObject({
      lastSyncAt: expected.lastSyncAt,
      lastAnalysisAt: expected.lastAnalysisAt,
      analysisStale: expected.analysisStale,
      failedJobCount: expected.failedJobCount,
      pendingDuplicateGroups: expected.pendingDuplicateGroups,
      pendingAiResults: expected.pendingAiResults,
    });
    expect(buildNextActions(readiness).map((action) => action.id)).toEqual(expected.actionIds);
  });

  it('orders failed-job, duplicate-review, and AI-review actions by priority', () => {
    seedHealthyState(db);
    seedDocument(db);
    db.insert(job)
      .values({
        id: 'failed-analysis',
        type: 'analysis',
        status: 'failed',
        createdAt: now.toISOString(),
      })
      .run();
    db.insert(duplicateGroup)
      .values({
        id: 'pending-group',
        confidenceScore: 0.9,
        algorithmVersion: 'v1',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();
    db.insert(aiProcessingResult)
      .values({
        id: 'pending-ai',
        documentId: 'document-1',
        paperlessId: 1,
        provider: 'openai',
        model: 'gpt-test',
        createdAt: now.toISOString(),
      })
      .run();

    const actions = buildNextActions(getReadiness(db, now));

    expect(actions.map((action) => action.id)).toEqual([
      'retry-failed-jobs',
      'review-duplicates',
      'review-ai-results',
    ]);
    expect(actions[0]).toMatchObject({ safeAction: 'retry', href: '/jobs' });
  });
});

function seedHealthyState(db: AppDatabase): void {
  db.insert(syncState)
    .values({
      id: 'singleton',
      lastSyncAt: '2026-07-23T11:00:00.000Z',
      lastAnalysisAt: '2026-07-23T11:30:00.000Z',
    })
    .run();
  saveAnalysisConfigHash(db, computeAnalysisConfigHash(getDedupConfig(db)));
}

function seedDocument(db: AppDatabase): void {
  db.insert(document)
    .values({
      id: 'document-1',
      paperlessId: 1,
      title: 'Document',
      processingStatus: 'completed',
      syncedAt: now.toISOString(),
    })
    .run();
}
