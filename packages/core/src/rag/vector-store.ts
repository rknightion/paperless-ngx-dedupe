import type Database from 'better-sqlite3';

let loaded = false;

export function loadSqliteVec(sqlite: Database.Database): void {
  if (loaded) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(sqlite);
    loaded = true;
  } catch {
    throw new Error(
      'Failed to load sqlite-vec extension. Ensure the sqlite-vec package is installed.',
    );
  }
}

export function initRagTables(sqlite: Database.Database, dimensions: number): void {
  // vec0 virtual table for vector search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_vec
    USING vec0(chunk_id TEXT PRIMARY KEY, embedding FLOAT[${dimensions}])
  `);

  // FTS5 virtual table for full-text search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_fts
    USING fts5(chunk_id, content)
  `);
}

export function insertChunkEmbedding(
  sqlite: Database.Database,
  chunkId: string,
  embedding: Float32Array,
): void {
  sqlite
    .prepare('INSERT INTO document_chunk_vec (chunk_id, embedding) VALUES (?, ?)')
    .run(chunkId, Buffer.from(embedding.buffer));
}

export function deleteChunkEmbeddings(sqlite: Database.Database, chunkIds: string[]): void {
  if (chunkIds.length === 0) return;
  const placeholders = chunkIds.map(() => '?').join(',');
  sqlite
    .prepare(`DELETE FROM document_chunk_vec WHERE chunk_id IN (${placeholders})`)
    .run(...chunkIds);
}

export function searchVectors(
  sqlite: Database.Database,
  queryEmbedding: Float32Array,
  topK: number,
): { chunkId: string; distance: number }[] {
  const rows = sqlite
    .prepare(
      `SELECT chunk_id, distance
       FROM document_chunk_vec
       WHERE embedding MATCH ?
         AND k = ?
       ORDER BY distance`,
    )
    .all(Buffer.from(queryEmbedding.buffer), topK) as {
    chunk_id: string;
    distance: number;
  }[];

  return rows.map((r) => ({ chunkId: r.chunk_id, distance: r.distance }));
}
