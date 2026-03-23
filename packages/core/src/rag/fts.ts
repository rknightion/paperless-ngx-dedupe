import type Database from 'better-sqlite3';

export function insertChunkFts(sqlite: Database.Database, chunkId: string, content: string): void {
  sqlite
    .prepare('INSERT INTO document_chunk_fts (chunk_id, content) VALUES (?, ?)')
    .run(chunkId, content);
}

export function deleteChunksFts(sqlite: Database.Database, chunkIds: string[]): void {
  if (chunkIds.length === 0) return;
  const placeholders = chunkIds.map(() => '?').join(',');
  sqlite
    .prepare(`DELETE FROM document_chunk_fts WHERE chunk_id IN (${placeholders})`)
    .run(...chunkIds);
}

export function searchFts(
  sqlite: Database.Database,
  query: string,
  topK: number,
): { chunkId: string; rank: number }[] {
  // Escape FTS5 special characters
  const safeQuery = query.replace(/['"*()]/g, ' ').trim();
  if (!safeQuery) return [];

  const rows = sqlite
    .prepare(
      `SELECT chunk_id, rank
       FROM document_chunk_fts
       WHERE document_chunk_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(safeQuery, topK) as { chunk_id: string; rank: number }[];

  return rows.map((r) => ({ chunkId: r.chunk_id, rank: r.rank }));
}
