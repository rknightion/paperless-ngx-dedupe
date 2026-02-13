/**
 * Locality-Sensitive Hashing (LSH) index for candidate pair discovery.
 */

import { fnv1a32 } from './shingles.js';

export class LSHIndex {
  readonly numPermutations: number;
  readonly numBands: number;
  readonly rowsPerBand: number;
  bands: Map<string, Set<string>>[];

  constructor(numPermutations = 192, numBands = 20) {
    this.numPermutations = numPermutations;
    this.numBands = numBands;
    this.rowsPerBand = Math.floor(numPermutations / numBands);
    this.bands = [];
    for (let i = 0; i < numBands; i++) {
      this.bands.push(new Map());
    }
  }

  private hashBand(signature: Uint32Array, bandIndex: number): string {
    const start = bandIndex * this.rowsPerBand;
    const end = start + this.rowsPerBand;
    const parts: string[] = [];
    for (let i = start; i < end; i++) {
      parts.push(String(signature[i]));
    }
    return String(fnv1a32(parts.join('|')));
  }

  insert(docId: string, signature: Uint32Array): void {
    for (let b = 0; b < this.numBands; b++) {
      const key = this.hashBand(signature, b);
      let bucket = this.bands[b].get(key);
      if (!bucket) {
        bucket = new Set();
        this.bands[b].set(key, bucket);
      }
      bucket.add(docId);
    }
  }

  getCandidates(signature: Uint32Array): Set<string> {
    const candidates = new Set<string>();
    for (let b = 0; b < this.numBands; b++) {
      const key = this.hashBand(signature, b);
      const bucket = this.bands[b].get(key);
      if (bucket) {
        for (const docId of bucket) {
          candidates.add(docId);
        }
      }
    }
    return candidates;
  }

  clear(): void {
    for (let i = 0; i < this.numBands; i++) {
      this.bands[i] = new Map();
    }
  }
}
