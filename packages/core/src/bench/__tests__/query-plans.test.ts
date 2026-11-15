import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSyntheticBenchmarkFixture, type SyntheticBenchmarkFixture } from '../fixtures.js';
import { assertBenchmarkQueryPlanContracts, collectBenchmarkQueryPlans } from '../query-plans.js';
import { getDocumentStats, listDocumentLibrary } from '../../queries/documents.js';
import { BENCHMARK_SCENARIOS } from '../library.bench.js';

describe('benchmark query-plan receipts', () => {
  let fixture: SyntheticBenchmarkFixture;

  beforeEach(async () => {
    fixture = await createSyntheticBenchmarkFixture({ documentCount: 1_000 });
  });

  afterEach(() => fixture.dispose());

  it('covers every measured workflow without embedding row values', () => {
    const receipts = collectBenchmarkQueryPlans(fixture.sqlite, fixture.db, BENCHMARK_SCENARIOS);

    expect(receipts.map(({ name }) => name)).toEqual([
      'overview',
      'library-default',
      'library-missing-ocr',
      'library-tag',
      'duplicate-inbox',
      'ai-inbox',
      'job-history',
    ]);
    expect(receipts).toHaveLength(BENCHMARK_SCENARIOS.length);
    expect(JSON.stringify(receipts)).not.toMatch(
      /Synthetic Document|synthetic benchmark text|suggested_title|error_message/i,
    );
  });

  it('uses required ordering indexes and permits only justified temporary sorts', () => {
    const receipts = collectBenchmarkQueryPlans(fixture.sqlite, fixture.db, BENCHMARK_SCENARIOS);

    expect(() => assertBenchmarkQueryPlanContracts(receipts)).not.toThrow();
    expect(receipts.find(({ name }) => name === 'library-default')?.indexes).toContain(
      'document_library_added_date_paperless_idx',
    );
    expect(receipts.find(({ name }) => name === 'duplicate-inbox')?.indexes).toContain(
      'idx_dg_inbox_order',
    );
    expect(receipts.find(({ name }) => name === 'job-history')?.indexes).toContain(
      'job_history_type_status_order_idx',
    );

    const ai = receipts.find(({ name }) => name === 'ai-inbox');
    expect(ai).toMatchObject({
      hasTemporarySort: true,
      temporarySortJustification: expect.stringContaining('computed confidence'),
    });
  });

  it('answers average word count and missing OCR from a covering index without reading text', () => {
    const prepare = vi.spyOn(fixture.sqlite, 'prepare');
    getDocumentStats(fixture.db);
    listDocumentLibrary(fixture.db, { duplicate: 'any', limit: 25 });
    const reads = prepare.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => /avg\([^)]*word_count|AS missingOcr/i.test(sql));
    prepare.mockRestore();
    expect(reads).toHaveLength(2);
    for (const sql of reads) {
      expect(sql).not.toContain('full_text');
      const plan = fixture.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
      expect(JSON.stringify(plan)).toContain(
        'USING COVERING INDEX document_content_document_word_count_idx',
      );
    }
  });

  it('reports actionable contract failures', () => {
    const receipts = collectBenchmarkQueryPlans(fixture.sqlite, fixture.db, BENCHMARK_SCENARIOS);
    const broken = receipts.map((receipt) =>
      receipt.name === 'duplicate-inbox'
        ? { ...receipt, indexes: [], hasTemporarySort: true }
        : receipt,
    );

    expect(() => assertBenchmarkQueryPlanContracts(broken)).toThrow(
      /duplicate-inbox.*idx_dg_inbox_order.*temporary sort/s,
    );
  });
});
