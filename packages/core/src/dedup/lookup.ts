import { z } from 'zod';
import { type AppDatabase } from '../db/client.js';
import { normalizeText } from '../sync/normalize.js';
import { getDedupConfig } from './config.js';
import { MinHash } from './minhash.js';
import { textToShingles } from './shingles.js';

const options = {
  limit: z.number().int().min(1).max(50).default(10),
  minSimilarity: z.number().min(0).max(1).optional(),
};
export const similarDocumentInputSchema = z.union([
  z.object({ paperlessId: z.number().int().positive(), ...options }).strict(),
  z.object({ text: z.string().max(500_000), ...options }).strict(),
]);

export class SimilarDocumentValidationError extends Error {}
export class SimilarDocumentNotFoundError extends Error {}

interface SignatureRow {
  documentId: string;
  paperlessId: number;
  title: string;
  signature: Buffer;
  numPermutations: number;
}

export interface SimilarDocumentMatch {
  documentId: string;
  paperlessId: number;
  title: string;
  jaccard: number;
}

/** Read matching signatures one row at a time and retain only the requested best matches. */
export function findSimilarDocuments(
  db: AppDatabase,
  input: z.input<typeof similarDocumentInputSchema>,
): { data: SimilarDocumentMatch[]; compared: number } {
  const parsed = similarDocumentInputSchema.parse(input);
  const config = getDedupConfig(db);
  const minimum = parsed.minSimilarity ?? config.similarityThreshold;
  let source: Uint32Array;
  let sourceDocumentId: string | null = null;
  if ('paperlessId' in parsed) {
    const row = db.$client
      .prepare(
        `
      SELECT d.id AS documentId, s.minhash_signature AS signature, s.num_permutations AS numPermutations
      FROM document d JOIN document_signature s ON s.document_id = d.id
      WHERE d.paperless_id = ? AND s.minhash_signature IS NOT NULL
        AND length(s.minhash_signature) = s.num_permutations * 4 AND s.num_permutations > 0
    `,
      )
      .get(parsed.paperlessId) as
      Pick<SignatureRow, 'documentId' | 'signature' | 'numPermutations'> | undefined;
    if (!row)
      throw new SimilarDocumentNotFoundError('Analysis has not processed this document yet');
    sourceDocumentId = row.documentId;
    source = MinHash.deserialize(row.signature, row.numPermutations).signature;
  } else {
    const normalized = normalizeText(parsed.text);
    const shingles = textToShingles(normalized.normalizedText, config.ngramSize, config.minWords);
    if (!shingles)
      throw new SimilarDocumentValidationError(
        'Text is too short for the configured minimum word count and n-gram size',
      );
    const signature = new MinHash(config.numPermutations);
    signature.update(shingles);
    source = signature.signature;
  }

  const rows = db.$client
    .prepare(
      `
    SELECT d.id AS documentId, d.paperless_id AS paperlessId, d.title,
      s.minhash_signature AS signature, s.num_permutations AS numPermutations
    FROM document_signature s JOIN document d ON d.id = s.document_id
    WHERE s.num_permutations = ? AND s.minhash_signature IS NOT NULL
      AND length(s.minhash_signature) = s.num_permutations * 4
  `,
    )
    .iterate(source.length);
  const data: SimilarDocumentMatch[] = [];
  let compared = 0;
  for (const value of rows) {
    const row = value as SignatureRow;
    if (row.documentId === sourceDocumentId) continue;
    const candidate = MinHash.deserialize(row.signature, row.numPermutations).signature;
    const jaccard = MinHash.jaccardFromArrays(source, candidate);
    compared++;
    if (jaccard < minimum) continue;
    data.push({
      documentId: row.documentId,
      paperlessId: row.paperlessId,
      title: row.title,
      jaccard,
    });
    data.sort((a, b) => b.jaccard - a.jaccard || a.paperlessId - b.paperlessId);
    if (data.length > parsed.limit) data.pop();
  }
  return { data, compared };
}
