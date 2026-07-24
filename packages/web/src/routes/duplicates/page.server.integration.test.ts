import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { duplicateGroup } from '@paperless-dedupe/core';

import { load } from './+page.server';

interface InboxPageData {
  groups: Array<{ id: string; status: string; confidenceScore: number }>;
  nextCursor: string | null;
  query: {
    queue: string;
    minConfidence?: number;
    limit: number;
    cursor?: string;
  };
}

describe('duplicate inbox page cursor integration', () => {
  it('keeps the queue and confidence filter across multiple pages', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE duplicate_group (
        id TEXT PRIMARY KEY NOT NULL,
        confidence_score REAL NOT NULL,
        jaccard_similarity REAL,
        fuzzy_text_ratio REAL,
        discriminative_score REAL,
        algorithm_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        archived_member_count INTEGER,
        archived_primary_title TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE document (
        id TEXT PRIMARY KEY NOT NULL,
        paperless_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
      CREATE TABLE duplicate_member (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0
      );
    `);
    const db = drizzle(sqlite);
    db.insert(duplicateGroup)
      .values([
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `pending-${index}`,
          confidenceScore: 0.99 - index / 1_000,
          algorithmVersion: 'v1',
          status: 'pending',
          createdAt: `2024-03-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
          updatedAt: `2024-03-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
        })),
        {
          id: 'below-filter',
          confidenceScore: 0.96,
          algorithmVersion: 'v1',
          status: 'pending',
          createdAt: '2024-04-01T00:00:00Z',
          updatedAt: '2024-04-01T00:00:00Z',
        },
        {
          id: 'wrong-status',
          confidenceScore: 1,
          algorithmVersion: 'v1',
          status: 'ignored',
          createdAt: '2024-04-02T00:00:00Z',
          updatedAt: '2024-04-02T00:00:00Z',
        },
      ])
      .run();

    const locals = {
      db,
      config: { PAPERLESS_URL: 'http://paperless.internal' },
    };
    const first = (await load({
      url: new URL('http://localhost/duplicates?queue=high-confidence&minConfidence=0.97&limit=2'),
      locals,
    } as never)) as InboxPageData;
    expect(first.groups).toHaveLength(2);
    expect(first.groups.every((group) => group.status === 'pending')).toBe(true);
    expect(first.groups.every((group) => group.confidenceScore >= 0.97)).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));

    const secondUrl = new URL(
      'http://localhost/duplicates?queue=high-confidence&minConfidence=0.97&limit=2',
    );
    secondUrl.searchParams.set('cursor', first.nextCursor!);
    const second = (await load({ url: secondUrl, locals } as never)) as InboxPageData;

    expect(second.query).toMatchObject({
      queue: 'high-confidence',
      minConfidence: 0.97,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.groups).toHaveLength(2);
    expect(second.groups.every((group) => group.status === 'pending')).toBe(true);
    expect(second.groups.every((group) => group.confidenceScore >= 0.97)).toBe(true);
    expect(second.groups.map((group) => group.id)).not.toEqual(
      first.groups.map((group) => group.id),
    );
    expect([...first.groups, ...second.groups].map((group) => group.id)).not.toContain(
      'wrong-status',
    );
    expect([...first.groups, ...second.groups].map((group) => group.id)).not.toContain(
      'below-filter',
    );
  });
});
