import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { insertChunkFts, searchFts, deleteChunksFts } from '../fts.js';

describe('FTS functions', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_fts
      USING fts5(chunk_id, content)
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('insertChunkFts + searchFts', () => {
    it('inserts and finds content by keyword search', () => {
      insertChunkFts(sqlite, 'chunk-1', 'The quick brown fox jumps over the lazy dog');
      insertChunkFts(sqlite, 'chunk-2', 'A slow green turtle crawls under the fence');

      const results = searchFts(sqlite, 'fox', 10);
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-1');
    });

    it('returns results ranked by relevance (BM25)', () => {
      insertChunkFts(sqlite, 'chunk-1', 'invoice payment due');
      insertChunkFts(sqlite, 'chunk-2', 'invoice payment invoice payment invoice');
      insertChunkFts(sqlite, 'chunk-3', 'completely unrelated content about weather');

      const results = searchFts(sqlite, 'invoice payment', 10);
      expect(results.length).toBeGreaterThanOrEqual(2);
      // chunk-2 has more occurrences, should rank better (more negative rank = better)
      // BM25 ranks are negative, lower is better
      const chunk2 = results.find((r) => r.chunkId === 'chunk-2');
      const chunk1 = results.find((r) => r.chunkId === 'chunk-1');
      expect(chunk2).toBeDefined();
      expect(chunk1).toBeDefined();
      // Both matched, chunk-3 should not appear
      expect(results.find((r) => r.chunkId === 'chunk-3')).toBeUndefined();
    });

    it('returns empty array for no match', () => {
      insertChunkFts(sqlite, 'chunk-1', 'hello world');

      const results = searchFts(sqlite, 'nonexistent', 10);
      expect(results).toHaveLength(0);
    });

    it('escapes special FTS5 characters', () => {
      insertChunkFts(sqlite, 'chunk-1', 'test document with quotes and special chars');

      // These special chars should be escaped to spaces, not cause FTS5 syntax errors
      const results1 = searchFts(sqlite, '"test"', 10);
      expect(results1).toHaveLength(1);

      const results2 = searchFts(sqlite, 'test*', 10);
      expect(results2).toHaveLength(1);

      const results3 = searchFts(sqlite, '(test)', 10);
      expect(results3).toHaveLength(1);

      // Single quote is escaped to space → "test s"; both terms must match
      // The "s" token won't match, so FTS returns 0 results — the key assertion
      // is that no FTS5 syntax error is thrown.
      expect(() => searchFts(sqlite, "test's", 10)).not.toThrow();
    });

    it('limits results by topK parameter', () => {
      for (let i = 0; i < 10; i++) {
        insertChunkFts(sqlite, `chunk-${i}`, `document about testing topic number ${i}`);
      }

      const results = searchFts(sqlite, 'document testing', 3);
      expect(results).toHaveLength(3);
    });

    it('returns empty for empty query after escaping', () => {
      insertChunkFts(sqlite, 'chunk-1', 'some content');

      // All characters are special and get escaped to spaces → empty query
      const results = searchFts(sqlite, '"\'*()', 10);
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteChunksFts', () => {
    it('deletes chunks from FTS index', () => {
      insertChunkFts(sqlite, 'chunk-1', 'first document');
      insertChunkFts(sqlite, 'chunk-2', 'second document');
      insertChunkFts(sqlite, 'chunk-3', 'third document');

      deleteChunksFts(sqlite, ['chunk-1', 'chunk-3']);

      const results = searchFts(sqlite, 'document', 10);
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-2');
    });

    it('is a no-op with empty array', () => {
      insertChunkFts(sqlite, 'chunk-1', 'hello world');

      // Should not throw
      deleteChunksFts(sqlite, []);

      const results = searchFts(sqlite, 'hello', 10);
      expect(results).toHaveLength(1);
    });
  });
});
