import { createHash } from 'node:crypto';
import type { Chunk } from './types.js';

interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

interface DocumentMeta {
  title: string;
  correspondent?: string | null;
}

const SEPARATORS = ['\n\n', '\n', '. ', ' '];

function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function recursiveSplit(text: string, maxChars: number, separatorIndex = 0): string[] {
  if (text.length <= maxChars) return [text];
  if (separatorIndex >= SEPARATORS.length) {
    // Hard split at maxChars
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      parts.push(text.slice(i, i + maxChars));
    }
    return parts;
  }

  const sep = SEPARATORS[separatorIndex];
  const segments = text.split(sep);
  const parts: string[] = [];
  let current = '';

  for (const segment of segments) {
    const candidate = current ? current + sep + segment : segment;
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = segment;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);

  // Recurse on any oversized parts
  const result: string[] = [];
  for (const part of parts) {
    if (part.length > maxChars) {
      result.push(...recursiveSplit(part, maxChars, separatorIndex + 1));
    } else {
      result.push(part);
    }
  }

  return result;
}

export function chunkDocument(fullText: string, meta: DocumentMeta, opts: ChunkOptions): Chunk[] {
  if (!fullText || fullText.trim().length === 0) return [];

  const maxChars = opts.chunkSize * 4; // Convert token estimate to chars
  const overlapChars = opts.chunkOverlap * 4;

  // Build metadata prefix for retrieval context
  const prefixParts = [`Title: ${meta.title}`];
  if (meta.correspondent) prefixParts.push(`From: ${meta.correspondent}`);
  const prefix = `[${prefixParts.join(' | ')}]\n`;

  const rawParts = recursiveSplit(fullText.trim(), maxChars - prefix.length);

  // Apply overlap
  const chunks: Chunk[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    let content = rawParts[i];

    // Prepend overlap from previous chunk
    if (i > 0 && overlapChars > 0) {
      const prev = rawParts[i - 1];
      const overlapText = prev.slice(-overlapChars);
      content = overlapText + content;
    }

    const chunkContent = prefix + content;
    chunks.push({
      content: chunkContent,
      chunkIndex: i,
      tokenCount: approximateTokens(chunkContent),
      contentHash: hashContent(chunkContent),
    });
  }

  return chunks;
}
