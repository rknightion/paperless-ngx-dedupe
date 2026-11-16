import { afterEach, expect, it } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { getGaugeStats } from '../gauge-stats.js';

const handle = createDatabaseWithHandle(':memory:');
afterEach(() => handle.sqlite.close());

it('counts documents, pending groups, running jobs and pending AI results', async () => {
  await migrateDatabase(handle.sqlite);
  const now = new Date().toISOString();
  for (const [index, status] of ['pending_review', 'applied'].entries()) {
    handle.sqlite
      .prepare(
        `INSERT INTO document (id, paperless_id, title, processing_status, synced_at)
      VALUES (?, ?, 'Synthetic document', 'completed', ?)`,
      )
      .run(`doc-${index}`, index + 1, now);
    handle.sqlite
      .prepare(
        `INSERT INTO ai_processing_result
      (id, document_id, paperless_id, provider, model, applied_status, created_at)
      VALUES (?, ?, ?, 'openai', 'synthetic', ?, ?)`,
      )
      .run(`ai-${index}`, `doc-${index}`, index + 1, status, now);
  }
  for (const status of ['pending', 'ignored']) {
    handle.sqlite
      .prepare(
        `INSERT INTO duplicate_group
      (id, status, confidence_score, algorithm_version, created_at, updated_at)
      VALUES (?, ?, 1, 'synthetic', ?, ?)`,
      )
      .run(`group-${status}`, status, now, now);
  }
  for (const status of ['running', 'completed']) {
    handle.sqlite
      .prepare(
        `INSERT INTO job (id, type, status, created_at)
      VALUES (?, 'sync', ?, ?)`,
      )
      .run(`job-${status}`, status, now);
  }
  expect(getGaugeStats(handle.db)).toEqual({
    documentsCount: 2,
    unresolvedDuplicatesCount: 1,
    activeJobsCount: 1,
    aiPendingCount: 1,
    pendingHighConfidenceCount: 1,
    pendingAmbiguousCount: 0,
    deadLetterJobsCount: 0,
    lastSyncSuccessTimestamp: undefined,
    lastAnalysisSuccessTimestamp: undefined,
  });
});
