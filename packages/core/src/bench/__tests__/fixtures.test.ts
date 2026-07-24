import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createSyntheticBenchmarkFixture,
  readSyntheticBenchmarkMetadata,
  SYNTHETIC_BENCHMARK_SIZES,
  type SyntheticBenchmarkFixture,
} from '../fixtures.js';

describe('synthetic benchmark fixtures', () => {
  const fixtures: SyntheticBenchmarkFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.dispose();
  });

  it('creates a deterministic relational workload outside repository data', async () => {
    const first = await createSyntheticBenchmarkFixture({ documentCount: 120 });
    const second = await createSyntheticBenchmarkFixture({ documentCount: 120 });
    fixtures.push(first, second);

    expect(SYNTHETIC_BENCHMARK_SIZES).toEqual([10_000, 50_000]);
    expect(first.path.startsWith(tmpdir())).toBe(true);
    expect(relative(process.cwd(), first.path)).toMatch(/^\.\./);
    expect(first.metadata).toEqual(second.metadata);
    expect(first.metadata).toMatchObject({
      documentCount: 120,
      contentCount: 96,
      duplicateGroupCount: 12,
      duplicateMemberCount: 42,
      aiResultCount: 90,
      jobCount: 60,
      synthetic: true,
      seed: 20_260_724,
    });
    expect(readSyntheticBenchmarkMetadata(first.sqlite)).toEqual(first.metadata);

    const firstDigest = first.sqlite
      .prepare(
        `SELECT
           count(*) AS documents,
           sum(paperless_id) AS paperlessIds,
           min(title) AS firstTitle,
           max(title) AS lastTitle
         FROM document`,
      )
      .get();
    const secondDigest = second.sqlite
      .prepare(
        `SELECT
           count(*) AS documents,
           sum(paperless_id) AS paperlessIds,
           min(title) AS firstTitle,
           max(title) AS lastTitle
         FROM document`,
      )
      .get();
    expect(firstDigest).toEqual(secondDigest);
    expect(JSON.stringify(first.metadata)).not.toMatch(
      /fullText|ocrText|documentText|sampleValue|firstTitle|lastTitle/,
    );

    const path = first.path;
    first.dispose();
    fixtures.splice(fixtures.indexOf(first), 1);
    expect(existsSync(path)).toBe(false);
  });

  it.each(SYNTHETIC_BENCHMARK_SIZES)(
    'proves realistic deterministic cardinality and selectivity at %,d documents',
    async (documentCount) => {
      const fixture = await createSyntheticBenchmarkFixture({ documentCount });
      fixtures.push(fixture);

      const cardinality = fixture.sqlite
        .prepare(
          `SELECT
             count(*) AS documents,
             count(added_date) AS datedDocuments,
             count(DISTINCT added_date) AS distinctAddedDates,
             sum(added_date IS NULL) AS nullAddedDates,
             sum(EXISTS (
               SELECT 1 FROM document_content c WHERE c.document_id = d.id
             )) AS documentsWithOcr,
             sum(EXISTS (
               SELECT 1 FROM ai_processing_result ai WHERE ai.document_id = d.id
             )) AS documentsWithAi,
             sum(EXISTS (
               SELECT 1 FROM duplicate_member dm WHERE dm.document_id = d.id
             )) AS documentsInDuplicates
           FROM document d`,
        )
        .get() as Record<string, number>;
      const groupSizes = fixture.sqlite
        .prepare(
          `SELECT min(member_count) AS minimumSize, max(member_count) AS maximumSize,
                  count(DISTINCT member_count) AS distinctSizes
           FROM (
             SELECT count(*) AS member_count
             FROM duplicate_member
             GROUP BY group_id
           )`,
        )
        .get();
      const confidence = fixture.sqlite
        .prepare(
          `SELECT
             sum(confidence_json IS NULL) AS nullConfidence,
             sum(confidence_json IS NOT NULL
               AND json_extract(confidence_json, '$.tags') IS NULL) AS partialConfidence,
             sum(json_extract(confidence_json, '$.tags') IS NOT NULL) AS fullConfidence
           FROM ai_processing_result`,
        )
        .get() as Record<string, number>;

      expect(fixture.metadata).toMatchObject({
        documentCount,
        contentCount: documentCount * 0.8,
        duplicateGroupCount: documentCount * 0.1,
        aiResultCount: documentCount * 0.75,
        jobCount: documentCount * 0.5,
        nullAddedDateCount: documentCount * 0.05,
      });
      expect(cardinality).toMatchObject({
        documents: documentCount,
        documentsWithOcr: fixture.metadata.contentCount,
        documentsWithAi: fixture.metadata.aiResultCount,
        nullAddedDates: fixture.metadata.nullAddedDateCount,
      });
      expect(cardinality.distinctAddedDates).toBeLessThan(cardinality.datedDocuments);
      expect(cardinality.documentsInDuplicates).toBeGreaterThan(0);
      expect(cardinality.documentsInDuplicates).toBeLessThan(documentCount);
      expect(groupSizes).toEqual({ minimumSize: 2, maximumSize: 5, distinctSizes: 4 });
      expect(confidence.nullConfidence).toBeGreaterThan(0);
      expect(confidence.partialConfidence).toBeGreaterThan(0);
      expect(confidence.fullConfidence).toBeGreaterThan(0);
    },
    20_000,
  );

  it('owns and removes its directory across injected open, migrate, seed, metadata, and close failures', async () => {
    const parentDirectory = mkdtempSync(join(tmpdir(), 'paperless-benchmark-owner-test-'));
    try {
      for (const failureStage of ['open', 'migrate', 'seed', 'metadata'] as const) {
        await expect(
          createSyntheticBenchmarkFixture(
            { documentCount: 20, parentDirectory },
            { failAt: failureStage },
          ),
        ).rejects.toThrow(`Injected ${failureStage} failure`);
        expect(readdirSync(parentDirectory)).toEqual([]);
      }

      const closeFailure = await createSyntheticBenchmarkFixture(
        { documentCount: 20, parentDirectory },
        { failAt: 'close' },
      );
      expect(() => closeFailure.dispose()).toThrow('Injected close failure');
      expect(readdirSync(parentDirectory)).toEqual([]);
    } finally {
      rmSync(parentDirectory, { recursive: true, force: true });
    }
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid document count %s', async (documentCount) => {
    await expect(createSyntheticBenchmarkFixture({ documentCount })).rejects.toThrow(
      'documentCount must be a positive integer',
    );
  });
});
